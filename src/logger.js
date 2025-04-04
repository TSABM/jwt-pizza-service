const config = require('./config.js');

class Logger {
  httpLogger = (req, res, next) => {
    //console.log("httpLogger was hit")
    let send = res.send;
    res.send = (resBody) => {
      const logData = {
        authorized: !!req.headers.authorization,
        path: req.originalUrl,
        method: req.method,
        statusCode: res.statusCode,
        reqBody: JSON.stringify(req.body),
        resBody: JSON.stringify(resBody),
      };
      const level = this.statusToLogLevel(res.statusCode);
      this.log(level, 'http', logData);
      res.send = send;
      return res.send(resBody);
    };
    next();
  };

  logDBRequests(SQLQuery, error = false){
    let level = this.statusToLogLevel()
    if (error != false){
        level = this.statusToLogLevel(500) //fixme hardcoding 500 for simplicity to reuse the http focused function. a more dynamic function might be better
    }
    this.log(level, 'SQL', SQLQuery)
  }

  logFactoryRequest(request, error = false){
    let level = this.statusToLogLevel()
    if (error != false){
        level = this.statusToLogLevel(500) //fixme hardcoding 500 for simplicity to reuse the http focused function. a more dynamic function might be better
    }
    this.log(level, 'Factory Request', request)
  }

  logUnhandledRouterExeptions(exception, error = false){
    let level = this.statusToLogLevel()
    if (error != false){
        level = this.statusToLogLevel(500) //fixme hardcoding 500 for simplicity to reuse the http focused function. a more dynamic function might be better
    }
    this.log(level, 'Exception', exception)
  }

  log(level, type, logData) {
    const labels = { component: config.logging.source, level: level, type: type };
    const values = [this.nowString(), this.sanitize(logData)];
    const logEvent = { streams: [{ stream: labels, values: [values] }] };

    this.sendLogToGrafana(logEvent);
  }

  statusToLogLevel(statusCode) {
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) return 'warn';
    return 'info';
  }

  nowString() {
    return (Math.floor(Date.now()) * 1000000).toString();
  }

  sanitize(logData) {
    logData = JSON.stringify(logData);
    return logData.replace(/\\"password\\":\s*\\"[^"]*\\"/g, '\\"password\\": \\"*****\\"');
  }

  sendLogToGrafana(event) {
    //console.log("sending log to grafana")
    const body = JSON.stringify(event);
    fetch(`${config.logging.url}`, {
      method: 'post',
      body: body,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.logging.userId}:${config.logging.apiKey}`,
      },
    }).then((res) => {
      if (!res.ok) console.log('Failed to send log to Grafana');
    });
  }
}
module.exports = new Logger();