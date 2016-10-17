const amqp = require('amqp');
const _ = require('lodash');
const async = require('async');

module.exports = class NodeAMQPLib {

    constructor(config) {
        this.config = config;
        this.queues = [];
    }

    publish(routingKey, message, options) {
        options = _.defaults(options, {
            contentType: 'application/json'
        });

        return new Promise((resolve, reject) => {
            this._getExchanges()
                .then(exchanges => {
                    exchanges.default.publish(routingKey, message, options);
                    resolve(true);
                })
                .catch(reject);
        });
    }

    subscribe(queueName, routingKey, action) {
        const options = {
            durable: true,
            autoDelete: false
        };
        return new Promise((resolve, reject) => {
            this._getExchanges()
                .then(exchanges => {
                    async.series([
                        (cb) => {
                            options.arguments = {
                                'x-dead-letter-exchange': 'dead_letters',
                                'x-dead-letter-routing-key': `${routingKey}.dead_letter`
                            };
                            this.connection.queue(queueName, options, (queue) => {
                                queue.bind(exchanges.default, routingKey, () => {
                                    queue.subscribe({
                                        ack: true,
                                        prefetchCount: 1
                                    }, (message, headers, deliveryInfo, messageObject) => {
                                        action(message, headers, deliveryInfo, messageObject);
                                    })
                                        .addCallback((ok) => {
                                            this.queues.push({
                                                name: queueName,
                                                consumerTag: ok.consumerTag,
                                                queue
                                            });
                                            cb();
                                        });
                                })
                            });
                        },
                        (cb) => {
                            this.connection.queue(`dead_letter:${queueName}`, options, (queue) => {
                                queue.bind(exchanges.dead_letters, `${routingKey}.dead_letter`, () => {
                                    this.queues.forEach(currentQueue => {
                                        if (currentQueue.name == queueName) currentQueue.deadLetter = queue;
                                    });
                                    cb();
                                });
                            });
                        }
                    ], err => {
                        if (err) return reject(err);
                        resolve();
                    });
                }).catch(reject);
        });
    }

    unsubscribe(queueName) {
        this.queues.forEach(queue => {
            if (queueName == queue.name) queue.queue.unsubscribe(queue.consumerTag);
        })
    }

    destroyQueue(queueName) {
        this.queues.forEach(queue => {
            if (queueName == queue.name) {
                queue.queue.destroy();
                queue.deadLetter.destroy();
            }
        })
    }

    close() {
        return new Promise((resolve) => {
            this._getConnection()
                .then(() => {
                    if (this.connection) this.connection.disconnect();
                    delete this.exchange;
                    delete this.connection;
                    resolve();
                })
        })
    }

    _getConnection() {
        return new Promise((resolve, reject) => {
            if (this.connection) return resolve(this.connection);
            this.connection = amqp.createConnection({
                host: this.config.host,
                port: this.config.port,
                login: this.config.username,
                password: this.config.password
            });
            this.connection.on('ready', () => resolve(this.connection));
            this.connection.on('error', reject);
        })
    }

    _getExchanges() {
        return new Promise((resolve, reject) => {
            if (!_.isEmpty(this.exchanges)) return resolve(this.exchanges);
                this._getConnection()
                .then(connection => {
                    this.exchanges = {};
                    async.each(
                        ['default', 'dead_letters'],
                        (name, cb) => {
                            let oppened = false;
                            this.exchanges[name] = connection.exchange(name, {
                                type: 'topic',
                                autoDelete: false,
                                durable: true
                            })
                                .on('open', () => {
                                    if (!oppened) {
                                        oppened = true;
                                        return cb();
                                    }
                                })
                                .on('error', reject)
                        }, err => {
                            if (err) return reject(err);
                            resolve(this.exchanges);
                        });
                })
                .catch(reject)
        })
    }
}
