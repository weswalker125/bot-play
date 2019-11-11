const keywords = require('../secrets/lookup.js');

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
	var words = event.text.toLowerCase().split(" ");

	var reply = null;
	for (var i = 0; i < words.length; ++i) {
		if (words[i] in keywords.lookup) {
			reply = keywords.lookup[words[i]];
			break;
		}
	}

	if (reply) {
		(async () => {
			try {
				console.log(`text: ${event.text}, reply: ${reply}, channel: ${event.channel}`);
				const result = await this.web.chat.postMessage({
					channel: event.channel,
					text: reply
				});
				console.log(`Successfully sent message ${result.ts} in channel: ${event.channel}`);
			} catch (error) {
				console.log(`Error posting Slack message: ${error}`);
			}
		})();
	}
};

module.exports = Bot;