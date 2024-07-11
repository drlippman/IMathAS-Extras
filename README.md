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

* Create a directory and copy into it index.js and package.json
* Go into the directory and run `npm install`
* Create a `certs` subdirectory

The code is set up to run on SSL, so you'll need to put your SSL keys in the
directory indicated in the code. Also change the livepollpassword value.

To setup the SSL
* Follow the instructions on the Certbot website on how to get a certificate.
  Note that this will require having a regular (Apache, etc) webserver running
  as well.
* Copy `livepoll.sh` into `/etc/letsencrypt/renewal-hooks/deploy/`, and edit it
  so the `livepoll_cert_root` is the path to the `certs` directory you created
  earlier.  Make sure to `chmod a+x livepoll.sh`.
* You may have to manually copy and chmod the certificates into the directory
  the first time.  The script above should handle updating it when the certs
  renew.

To keep the server running in the background, you'll need to set up some kind
of autostart config.  
* Copy `livepoll.service` to `/lib/systemd/system/`, editing the `ExecStart` 
  path as needed.
* Start the server using `sudo systemctl start livepoll`

Once set up, put `$CFG['GEN']['livepollserver'] = 'your.server.com'` and
`$CFG['GEN']['livepollpassword'] = 'yourpassword'` in your IMathAS config.php.

Note that the livepoll server runs on port 3000, so make sure your server is
set to allow connections on port 3000.

## mmltex
This script will attempt to convert all the `<math>` tags in an HTML document
to Wordpress-style latex tags using an xsl transform
