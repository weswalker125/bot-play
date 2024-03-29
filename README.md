# BotPlay

## Configuration files
config/lookup.js should export a variable "lookup" with the key/value pairs for words you're looking for and the response to provide.  (ordered presedence).

Example of lookup.js

```
exports.lookup = {
	hello: "Hola!",
	goodbye: "See ya later."
};
```

Example of local.yml

```
prod:
  slack:
    clientId: asdsadad
    clientSecret: asdasd
    signingSecret: asadasdadad
  covid:
    host: asadasdadad.asdoijsaoidja.com
    key: asadasdadadasadasdadad

```

## Setup
1. Sign into Slack workspace
2. Go to [Build app](https://api.slack.com)
3. Create new app, assign a name and associate with workspace.
4. (In app settings) Go to Features/Bot Users, turn on and assign bot name.
5. (In app settings) Go to Features/OAuth & Permissions, click "Install App to Workspace".  Record the tokens in config/config.yml. Add the /authorized URL to the "Redirect URL" - as the confirmation code will be sent to the app from the "Install App" submission page after success.  (Note, you will have to re-install app when changing event subscriptions).
6. (In app settings) Go to Features/Event Subscriptions, turn on "Enable Events".  Then supply your '/event' URL to the "Request URL" field.  Then under "Subscribe to workspace events" add


## Deploy


## Local
```
npm i
npm run pull-secrets
npm run test
```