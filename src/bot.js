const Logger = require('node-json-logger'),
	Covid = require('./covid.js'),
	keywords = require('../config/lookup.js');

// pseudo-command (not a legit Slack command) to trigger virus stats response
const COMMAND_COVID = '!covid ';

// Environment variables
const { LOG_LEVEL } = process.env;

// Configure logger
const logger = new Logger({ timestamp: false, level: LOG_LEVEL });

const Bot = function(web) {
	this.web = web;
};

Bot.prototype.process = function(event) {
	// Command for covid stats
	if (event.text.startsWith(COMMAND_COVID)) {
		var statParams = event.text.replace(COMMAND_COVID, '');
		Covid.stats(event.user, statParams)
		.then(resp => {
			this.respond(event.channel, resp);
		});
	} else {
		var reply = null;
		var words = event.text.split(" ");

		// Static lookup response
		for (var i = 0; i < words.length; ++i) {
			if (words[i].toLowerCase() in keywords.lookup) {
				reply = keywords.lookup[words[i]];
				break;
			}
		}

		if (reply) {
			this.respond(event.channel, reply);
		}
	}
};

Bot.prototype.respond = async function(channel, reply) {
	try {
		logger.info(`Replying: ${reply}, channel: ${channel}`);
		if (!process.env.IS_OFFLINE) {
			const result = await this.web.chat.postMessage({
				channel: channel,
				text: reply
			});
			logger.info(`Successfully sent message ${result.ts} in channel: ${channel}`);
		}
	} catch (error) {
		logger.error(`Error posting Slack message: ${error}`);
	}
}

module.exports = Bot;