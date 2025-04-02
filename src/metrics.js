const config = require('./config');
const os = require('os');

class Metrics {
    constructor() {
        this.requestsByMethod = { GET: 0, POST: 0, DELETE: 0, PUT: 0 };
        this.activeUsers = 0;
        this.successfulAuthAttempts = 0;
        this.failedAuthAttempts = 0;
        this.pizzasMade = 0;
        this.totalPrice = 0;
        this.pizzaCreationFails = 0;
        this.generalLatency = 0;
        this.pizzaLatency = 0;
    }

    getRequests(req, res, next) {
        let requestMethod = req.method.toUpperCase();
        if (requestMethod in this.requestsByMethod) {
            this.requestsByMethod[requestMethod] += 1;
        }
        next();
    }

    incrementActiveUsers() {
        this.activeUsers += 1;
    }

    decrementActiveUsers() {
        this.activeUsers -= 1;
    }

    incrementSuccessfulAuthAttempts() {
        this.successfulAuthAttempts += 1;
    }

    incrementFailedAuthAttempts() {
        this.failedAuthAttempts += 1;
    }

    getCpuUsagePercentage() {
        const cpuUsage = os.loadavg()[0] / os.cpus().length;
        return (cpuUsage * 100).toFixed(2);
    }

    getMemoryUsagePercentage() {
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        return ((usedMemory / totalMemory) * 100).toFixed(2);
    }

    incrementPizzasMade(pizzasSold, orderPrice) {
        this.pizzasMade += pizzasSold;
        this.totalPrice += orderPrice;
    }

    incrementFailedPizzas() {
        this.pizzaCreationFails += 1;
    }

    addLatency(latency) {
        this.generalLatency += latency;
    }

    addPizzaLatency(latency) {
        this.pizzaLatency += latency;
    }

    sendMetricsPeriodically(period) {
        setInterval(() => {
            try {
                this.sendMetricToGrafana("requests_GET", this.requestsByMethod.GET, "sum", '1');
                this.sendMetricToGrafana("requests_POST", this.requestsByMethod.POST, "sum", '1');
                this.sendMetricToGrafana("requests_DELETE", this.requestsByMethod.DELETE, "sum", '1');
                this.sendMetricToGrafana("requests_PUT", this.requestsByMethod.PUT, "sum", '1');
                this.sendMetricToGrafana("active_users", this.activeUsers, "sum", '1');
                this.sendMetricToGrafana("auth_success", this.successfulAuthAttempts, "sum", '1');
                this.sendMetricToGrafana("auth_failed", this.failedAuthAttempts, "sum", '1');
                this.sendMetricToGrafana("cpu_usage", this.getCpuUsagePercentage(), "gauge", '%');
                this.sendMetricToGrafana("memory_usage", this.getMemoryUsagePercentage(), "gauge", '%');
                this.sendMetricToGrafana("pizzas_sold", this.pizzasMade, "sum", '1');
                this.sendMetricToGrafana("revenue", this.totalPrice, "sum", '$');
                this.sendMetricToGrafana("pizza_fails", this.pizzaCreationFails, "sum", '1');
                this.sendMetricToGrafana("general_latency", this.generalLatency, "sum", 'ms');
                this.sendMetricToGrafana("pizza_latency", this.pizzaLatency, "sum", 'ms');
            } catch (error) {
                console.log('Error sending metrics', error);
            }
        }, period);
    }

    sendMetricToGrafana(metricName, metricValue, type, unit) {
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