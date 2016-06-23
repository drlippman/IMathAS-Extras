# IMathAS-Extras
Supplemental code related to IMathAS

## pandoc server
This is used by the "Convert to Word" print version option in IMathAS.

Note: 
* pandoc needs to be installed on the server. Ideally the most recent version. Check the code to update the path if needed.
* the imgs subdirectory needs to be writable by the web server.
* the ../datatmp/ directory needs to be writable by the web server.
* you do not need uniconvertor. That was an experiment that didn't work.

## livepoll server
This sets up a websocket server to enable the LivePoll feature in IMathAS.

The basic app setup follows the process in the
[example chat application](http://socket.io/get-started/chat/).  Follow those
procedures to set up the framework. Specifically:
* Create the package.json as it describes
* npm install express
* npm install socket.io
* Use the index.js from this repo

To keep the server running in the background, you'll need to set up some kind
of autostart config.

The code is set up to run on SSL, so you'll need to put your SSL keys in the
directory indicated in the code. Also change the livepollpassword value.

Once set up, put `$CFG['GEN']['livepollserver'] = 'your.server.com'` and
`$CFG['GEN']['livepollpassword'] = 'yourpassword` in your IMathAS config.php.

## mmltex
This script will attempt to convert all the `<math>` tags in an HTML document
to Wordpress-style latex tags using an xsl transform
