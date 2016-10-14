const assert = require('assert');
const NodeAMQPLib = require('../');

const config = {
    host: 'localhost',
    port: 5672,
    username: 'guest',
    password: 'guest'
};

describe('Test', function(){

    it('Should send a message', function(done){
        const nodeAMQPLib = new NodeAMQPLib(config)
        nodeAMQPLib.subscribe('testQueue', 'test.key', (message, headers, deliveryInfo, messageObject) => {
            assert.deepEqual({foo: 'bar'}, message);
            messageObject.acknowledge(true);
            nodeAMQPLib.destroyQueue('testQueue');
            done();
        })
            .then(() => nodeAMQPLib.publish('test.key', {foo: 'bar'}))
            .then(result => assert(result))
            .catch(err => assert.ifError(err));
    })

})
