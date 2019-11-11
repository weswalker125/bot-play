const Logger = require('node-json-logger');
const axios = require('axios');
const keywords = require('../secrets/lookup.js');

const logger = new Logger({ timestamp: false });

const Bot = function(web) {
	this.web = web;
};

Array.prototype.contains = function(obj) {
    var i = this.length;
    while (i--) {
        if (this[i] === obj) {
            return true;
        }
    }
    return false;
}

Bot.prototype.process = function(event) {
	var words = event.text.split(" ");
	var reply = null;
	// Command for covid stats
	if (words[0] === "!covid") {
		if (words.length < 2) {
			reply = "Give me a country, like `!covid {country} {province}` or `!covid China`";
			this.respond(event, reply);
		} else {
			var country = words[1];
			var province = words.slice(2).join(' ');
			var url = `https://${process.env.COVID_API_HOST}/v1/stats`;

			logger.debug(`URL: ${url}`);
			logger.debug(`Country: ${country}`);
			logger.debug(`COVID_API_HOST: ${process.env.COVID_API_HOST}`);
			logger.debug(`COVID_API_KEY: ${process.env.COVID_API_KEY}`);
			axios({
				"method": 'GET',
				"url": url,
				"responseType": 'application/octet-stream',
				"headers": {
					"content-type": "application/octet-stream",
					"x-rapidapi-host": process.env.COVID_API_HOST,
					"x-rapidapi-key": process.env.COVID_API_KEY
				}, "params": {
					"country": country
				}
			})
			.then((response) => {
				logger.trace(`Response: ${JSON.stringify(response.data)}`);
				if (response.data.statusCode === 200) {
					var covidStats = response.data.data.covid19Stats;
					var totals = {};
					if (province !== '') {
						// Filter down to province, report on it.
						totals = covidStats.find(stats => stats.province.toLowerCase() === province.toLowerCase());
					} else {
						// Find sum totals
						totals = {
							deaths: covidStats.reduce((prev, cur) => { return prev + cur.deaths }, 0),
							confirmed: covidStats.reduce((prev, cur) => { return prev + cur.confirmed }, 0),
							recovered: covidStats.reduce((prev, cur) => { return prev + cur.recovered }, 0),
							lastUpdate: covidStats.find(x => x.lastUpdate).lastUpdate,
							province: '',
							country: covidStats.find(x => x.country).country
						};
					}

					this.respond(event, `According to most recent report on ${totals.lastUpdate}, there are ${totals.confirmed} confirmed cases of which ${totals.recovered} have recovered and ${totals.deaths} have died of COVID-19 in ${totals.province}${totals.province !== '' ? ', ' : ''} ${totals.country}`);
				} else {
					this.respond(event, 'DEAD.');
				}
			})
			.catch((err) => {
				logger.error(`Error on request to API. ${err}`);
				this.respond(event, 'Unable to get stats; I am unwell.');
			});
		}
	} else {
		// Static lookup response
		for (var i = 0; i < words.length; ++i) {
			if (words[i].toLowerCase() in keywords.lookup) {
				reply = keywords.lookup[words[i]];
				break;
			}
		}

		if (reply) {
			respond(event, reply);
		}
	}
};

Bot.prototype.respond = async function(event, reply) {
	try {
		logger.info(`text: ${event.text}, reply: ${reply}, channel: ${event.channel}`);
		if (!process.env.IS_OFFLINE) {
			const result = await this.web.chat.postMessage({
				channel: event.channel,
				text: reply
			});
			logger.info(`Successfully sent message ${result.ts} in channel: ${event.channel}`);
		}
	} catch (error) {
		logger.error(`Error posting Slack message: ${error}`);
	}
}

module.exports = Bot;