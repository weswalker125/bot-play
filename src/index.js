const
    SlackAuthenticationModule = require('./authentication.js'),
    Bot = require('./bot.js'),
    aws = require('aws-sdk'),
    { WebClient } = require('@slack/web-api'),
    responseTemplates = require('./templates.js');

const { ACCESS_TOKEN_TABLE, IS_OFFLINE } = process.env;
const client = {
    id: process.env.SLACK_APP_CLIENT_ID,
    secret: process.env.SLACK_APP_CLIENT_SECRET,
    // Signing Secret is used to compute hash of request to verify it's origin.
    signingSecret: process.env.SLACK_APP_SIGNING_SECRET
};

// Set up DynamoDB accessor (local or cloud)
const dynamoDb = IS_OFFLINE === 'true' ?
    new aws.DynamoDB.DocumentClient({
        region: 'localhost',
        endpoint: 'http://localhost:8000'
    }) :
    new aws.DynamoDB.DocumentClient();

const auth = new SlackAuthenticationModule(client, dynamoDb, ACCESS_TOKEN_TABLE);
/**
 * Lambda event handler
 */
exports.handler = (event, context, callback) => {
    console.log('handler:event %j', event);
    console.log('handler:context %j', context);
    
    // Confirm request's validity/origin
    auth.verifyRequest(event, client.signingSecret).then(verifiedEvent => {
        switch(verifiedEvent.requestPath) {
            case '/install':
                context.succeed(responseTemplates.install(client.id));
                break;
            case '/authorized':
                authorized(verifiedEvent.query || {}).then(() => {
                    context.succeed(responseTemplates.authorized());
                });
                break;
            case '/event':
                receiveEvent(verifiedEvent.body || {}, context).then(response => {
                    callback(null, response);
                });
                break;
            default:
                console.log('unexpected request path: ' + verifiedEvent.requestPath);
        }
    }).catch(reason => {
        callback(null, {
            statusCode: 400,
            headers: {
                'Content-Type': 'text/html'
            },
            body: 'Verification failed: ' + reason
        });
    })
};

function authorized(payload, context) {
    console.log('authorized:payload %j', payload);
    console.log('authorized:context %j', context);

    return new Promise((resolve, reject) => {
        auth.requestAccessTokenFromSlack(payload.code || {})
            .then(response => auth.storeAccessToken(response))
            .then(resolve)
            .catch(reject);
    });
}

function receiveEvent(payload) {
    console.log('receiveEvent:payload %j', payload);

    // const jsonBody = JSON.parse(payload.body);
    const response = { statusCode: 200 };

    return new Promise((resolve, reject) => {
        switch (payload.type) {
            // Auth challenge?
            case 'url_verification':
                response.headers = {
                    'Content-Type': 'application/x-www-form-urlencoded'
                };
                response.body = payload.challenge;
                break;
            // An event we're subscribed to has occurred
            case 'event_callback':
                auth.retrieveAccessToken(payload.team_id)
                    .then(botAccessToken => handleEvent(payload.event, botAccessToken))
                    .catch(error => { 
                        console.log(error);
                        response.statusCode = 500;
                        response.body = error;
                    });
                break;
        }
        resolve(response);
    });
}

/**
 * Process the Slack event that was pushed to the app based on Event Subscriptions.
 * @param {*} event 
 * @param {*} token 
 */
function handleEvent(event, token) {
    console.log('handleEvent:event %j', event);
    console.log('handleEvent:token %j', token);
    
    const bot = new Bot(new WebClient(token));
    switch (event.type) {
        case 'message':
            // ignore bot messages (to include ourself).
            if (!(event.subtype && event.subtype === 'bot_message')) {
                bot.process(event);
            }
            break;
        default:
            console.log('Unexpected event type: ' + event.type);
    }
}