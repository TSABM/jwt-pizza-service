const config = require('./config');
const os = require('os');

class Metrics {
    static requestsByMethod = { GET: 0, POST: 0, DELETE: 0, PUT: 0 };
    static activeUsers = 0;
    static successfulAuthAttempts = 0;
    static failedAuthAttempts = 0;
    static pizzasMade = 0;
    static totalPrice = 0;
    static pizzaCreationFails = 0;
    static generalLatency = 0;
    static pizzaLatency = 0;

    static getRequests(req, res, next) {
        let requestMethod = req.method.toUpperCase();
        if (requestMethod in Metrics.requestsByMethod) {
            Metrics.requestsByMethod[requestMethod] += 1;
        }
        next();
    }

    static incrementActiveUsers() {
        Metrics.activeUsers += 1;
    }

    static decrementActiveUsers() {
        Metrics.activeUsers -= 1;
    }

    static incrementSuccessfulAuthAttempts() {
        Metrics.successfulAuthAttempts += 1;
    }

    static incrementFailedAuthAttempts() {
        Metrics.failedAuthAttempts += 1;
    }

    static getCpuUsagePercentage() {
        const cpuUsage = os.loadavg()[0] / os.cpus().length;
        return (cpuUsage * 100).toFixed(2);
    }

    static getMemoryUsagePercentage() {
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        return ((usedMemory / totalMemory) * 100).toFixed(2);
    }

    static incrementPizzasMade(pizzasSold, orderPrice) {
        Metrics.pizzasMade += pizzasSold;
        Metrics.totalPrice += orderPrice;
    }

    static incrementFailedPizzas() {
        Metrics.pizzaCreationFails += 1;
    }

    static addLatency(latency) {
        Metrics.generalLatency += latency;
    }

    static addPizzaLatency(latency) {
        Metrics.pizzaLatency += latency;
    }

    static sendMetricsPeriodically(period) {
        setInterval(() => {
            try {
                Metrics.sendMetricToGrafana("requests_GET", Metrics.requestsByMethod.GET, "sum", '1');
                Metrics.sendMetricToGrafana("requests_POST", Metrics.requestsByMethod.POST, "sum", '1');
                Metrics.sendMetricToGrafana("requests_DELETE", Metrics.requestsByMethod.DELETE, "sum", '1');
                Metrics.sendMetricToGrafana("requests_PUT", Metrics.requestsByMethod.PUT, "sum", '1');
                Metrics.sendMetricToGrafana("active_users", Metrics.activeUsers, "sum", '1');
                Metrics.sendMetricToGrafana("auth_success", Metrics.successfulAuthAttempts, "sum", '1');
                Metrics.sendMetricToGrafana("auth_failed", Metrics.failedAuthAttempts, "sum", '1');
                Metrics.sendMetricToGrafana("cpu_usage", Metrics.getCpuUsagePercentage(), "gauge", '%');
                Metrics.sendMetricToGrafana("memory_usage", Metrics.getMemoryUsagePercentage(), "gauge", '%');
                Metrics.sendMetricToGrafana("pizzas_sold", Metrics.pizzasMade, "sum", '1');
                Metrics.sendMetricToGrafana("revenue", Metrics.totalPrice, "sum", '$');
                Metrics.sendMetricToGrafana("pizza_fails", Metrics.pizzaCreationFails, "sum", '1');
                Metrics.sendMetricToGrafana("general_latency", Metrics.generalLatency, "sum", 'ms');
                Metrics.sendMetricToGrafana("pizza_latency", Metrics.pizzaLatency, "sum", 'ms');
            } catch (error) {
                console.log('Error sending metrics', error);
            }
        }, period);
    }

    static sendMetricToGrafana(metricName, metricValue, type, unit) {
        const metric = {
            resourceMetrics: [
                {
                    scopeMetrics: [
                        {
                            metrics: [
                                {
                                    name: metricName,
                                    unit: unit,
                                    [type]: {
                                        dataPoints: [
                                            {
                                                asDouble: metricValue,
                                                timeUnixNano: Date.now() * 1000000,
                                            },
                                        ],
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        if (type === 'sum') {
            metric.resourceMetrics[0].scopeMetrics[0].metrics[0][type].aggregationTemporality = 'AGGREGATION_TEMPORALITY_CUMULATIVE';
            metric.resourceMetrics[0].scopeMetrics[0].metrics[0][type].isMonotonic = true;
        }

        const body = JSON.stringify(metric);
        fetch(`${config.metrics.url}`, {
            method: 'POST',
            body: body,
            headers: { Authorization: `Bearer ${config.metrics.apiKey}`, 'Content-Type': 'application/json' },
        })
            .then((response) => {
                if (!response.ok) {
                    response.text().then((text) => {
                        console.error(`Failed to push metrics data to Grafana: ${text}\n${body}`);
                    });
                }
            })
            .catch((error) => {
                console.error('Error pushing metrics:', error);
            });
    }
}

module.exports = new Metrics();
