# Setting up IMathAS in AWS
This document covers the process for setting up IMathAS in Amazon Web Services, running in Beanstalk and RDS.

# Preliminaries
## Network
- Create a VPC
- Create a subnet for each availablility zone (AZ)
- Create an internet gateway attached to the VPC
- Create a route table for the VPC, using the subnets and gateway

## Database
Set up the database in RDS, using the VPC

## SSL
From Certificate Manager, create an SSL certificate

# Beanstalk
## Configuration
### Software
Enable streaming to CloudWatch logs, 90 retention
Enter environment properties used in config.php
- AWS_ACCESS_KEY_ID
- AWS_SECRET_KEY
- CONFIG_ENV = production
- DB_PASSWORD
- DB_SERVER
- DB_USERNAME
- FCM_SERVER_KEY
- FCM_SERVER_KEY_W
- LUMEN_AWS_KEY
- LUMEN_AWS_SECRET
- NR_APP_NAME
- NR_INSTALL_KEY
- SES_KEY_ID
- SES_SECRET_KEY

### Instances
m3.medium
Select the security groups for the VPC and RDS

### Capacity
Load Balanced, min 2 max 6
Scale on CPUUtilization
- Period: 2 min
- Breach duration: 10min
- Upper: 70%  +1
- Lower: 50%   -1
Time based scaling:
- Upscale min 3 max 6: `0 13 * * MON-FRI`
- Downscale min 2 max 6: `0 7 * * TUE-SAT`

### Load Balancer
Classic
Port 80 HTTP and Port 443 HTTPS both route to HTTP 80
Select the SSL certificate
Sticky sessions, both ports
Heath check path: /status.ph, 5 sec timeout, 10 sec interval

### VPC
Select a VPC
All AZs
Enable Public IP address
All subnets

## Code
### For AWS
In config.php, use `getenv('DB_SERVER')` to get the environment variables from the EBS config and store them to the IMathAS config variables.

In config.php, add
````
if (isset($_SERVER['HTTP_X_FORWARDED_FOR']) && filter_var($_SERVER['HTTP_X_FORWARDED_FOR'], FILTER_VALIDATE_IP)) {
  $_SERVER['REMOTE_ADDR'] = $_SERVER['HTTP_X_FORWARDED_FOR'];
}
````

Create an .ebextensions folder, and create these files with this content:
#### 01run.config
````
commands:
  security_updates: 
    command: "yum update -y --security"
````
#### cgi.config
````
---
files:
  /etc/httpd/conf.modules.d/01-cgi.conf:
    content: |
        <IfModule mpm_worker_module>
         LoadModule cgid_module modules/mod_cgid.so
        </IfModule>
        <IfModule mpm_event_module>
           LoadModule cgid_module modules/mod_cgid.so
        </IfModule>
        <IfModule mpm_prefork_module>
           LoadModule cgi_module modules/mod_cgi.so
        </IfModule>
    group: root
    mode: "000644"
    owner: root
````
#### customlog.config
````
files:
  "/etc/httpd/conf.d/custom_log.conf":
    mode: "000644"
    owner: root
    group: root
    content: |
      LogFormat "%{X-Forwarded-For}i %l %u %t \"%r\" %>s %b \"%{Referer}i\" \"%{User-Agent}i\"" combined

````

#### mimetex.config
````
---
files:
  /var/www/cgi-bin/mimetex.cgi:
    group: root
    mode: "000755"
    owner: root
    source: "https://s3-us-west-2.amazonaws.com/myopenmath-config/mimetex64.cgi"
  /var/www/cgi-bin/mimetex64.cgi:
    group: root
    mode: "000755"
    owner: root
    source: "https://s3-us-west-2.amazonaws.com/myopenmath-config/mimetex64.cgi"

````
#### packages.config
````
---
packages:
  yum:
      freetype-devel: []
````

#### phpini.config
````
---
files:
  "/etc/php.d/imathas.ini" :
    mode: "000644"
    owner: root
    group: root
    content: |
      error_reporting = E_ALL & ~E_NOTICE
      upload_max_filesize = 10M
      max_input_vars = 5000
````

### Deploying
To deploy a new version of the code, just use Git export to bundle the code as a .zip, and upload it through the console.

## DNS
In Route 53, create an A record that is an Alias.  Select the beanstalk environment as the target.

# Utilities
## Tag/Run Course Cleanup
In Simple Notification Service:
- Create a topic for tagcoursecleanup
- Select the topic, and under Actions select Subscribe to Topic
- For protocol choose `HTTPS`
- For endpoint use: `https://yoursite.com/util/tagcoursecleanup.php?authcode=###`, where ### is the authcode you put in config.php as `$CFG['cleanup']['authcode']`
- From the Subscriptions page, select the subscription and select "Edit Subscription Delivery Policy" from the Actions pulldown.  Set Number of Retries to 0.
- Repeat, creating a topic and subscription for runcoursecleanup, with an endpoint of `https://yoursite.com/util/runcoursecleanup.php?authcode=###` 

In Cloudwatch:
- Under Rules, create a new rule
- Use Schedule: `0 9 * * ? *`
- Under Add Target, select SNS Topic and select the one you set up earlier for  tagcoursecleanup
- Create another rule, with schedule:  `0/10 07-12 * * ? *`
- Under Add Target, select SNS Topic and select the one you set up earlier for runcoursecleanup

## LTI Message Queue
In Simple Notification Service:
- Create a topic for ltimessagequeue
- Select the topic, and under Actions select Subscribe to Topic
- For protocol choose `HTTPS`
- For endpoint use: `https://yoursite.com/admin/processltiqueue.php?authcode=###`, where ### is the authcode you put in config.php as `$CFG['LTI']['authcode']`
- From the Subscriptions page, select the subscription and select "Edit Subscription Delivery Policy" from the Actions pulldown.  Set Number of Retries to 0.

In Cloudwatch:
- Under Rules, create a new rule
- Use Schedule, fixed rate of 1 minute
- Under Add Target, select SNS Topic and select the one you set up earlier for ltimessagequeue

## Secondary Database Backup
- In Lambda:
    - Create a new function using Node 6
    - Code entry: inline
    - Handler: index.handler
    - Code:  See end of document
- In Cloudwatch:
	- Under Rules, create a new rule
	- Use Schedule: `0 10 ? * SUN *`
	- Add Target:  Lambda function, and select the function you created

### Database Backup Lambda code
````
var AWS = require('aws-sdk');
var rds = new AWS.RDS();

function copysnapshot(source, dest) {
    rds.deleteDBSnapshot({
        DBSnapshotIdentifier: dest
    }, function(err, data) {
        if (err) {} //console.log(err, err.stack); // an error occurred
        //else     console.log(data);           // successful response
    });
    rds.copyDBSnapshot({
        SourceDBSnapshotIdentifier: source,
        TargetDBSnapshotIdentifier: dest
    }, function(err, data) {
        if (err) console.log(err, err.stack); // an error occurred
        else     console.log("Created:" + dest);           // successful response
    });
}
exports.handler = (event, context, callback) => {
    var DB_IDENTIFIER = "**EDIT ME**";

    rds.describeDBSnapshots({
	    DBInstanceIdentifier: DB_IDENTIFIER,
	    SnapshotType: "automated"
    }, function(err, data) {
	    if (err) { 
		    console.log(err, err.stack);
	    } else {
    		data.DBSnapshots.sort(function(a,b) {
    		    return (a.SnapshotCreateTime<b.SnapshotCreateTime)?1:-1
    		});
    		var source_dbidentifier = data.DBSnapshots[0].DBSnapshotIdentifier;
    		var week_count = Math.floor((Date.now() - Date.parse("Jan 1 2018"))/(365.25*24*60*60*1000) * 52.1786);
    		var now = new Date();
    		var month = now.getMonth();
    		var year = now.getFullYear();
    		if (month%6 == 0 && week_count%4==0) { //bi-yearly
    		    copysnapshot(source_dbidentifier, DB_IDENTIFIER+'-biyearly-'+month+'-'+year);
    		} else if (week_count%4==0) { //monthly
    		    var monthn = month%6;
    		    copysnapshot(source_dbidentifier, DB_IDENTIFIER+'-monthly-'+monthn);
    		} else { //weekly, since we're running this once a week
    		    var weekn = week_count%4;
    		    copysnapshot(source_dbidentifier, DB_IDENTIFIER+'-weekly-'+weekn);
    		}
    	}
    });
};
````
# Maintenence tasks
## Updating Avg Time per Question
- In Data Pipeline, create a new pipeline using the "Full copy of RDS MySQL table to S3" template.
	- The table name should a fully qualified reference to the imas_firstscores table, including database name, like `myopenmathdb.imas_firstscores`
	- Edit the new pipeline in Architect
	- Expand the DataNodes, and change the Select query to `select qsetid,score,timespent from #{table}`
- Run the pipeline
- Download the CSV file from S3
- Download the [firstscores R script](https://github.com/drlippman/IMathAS-Extras/blob/master/firstscores.txt) from Github.
- Run the R script, making sure it's in the same directory as imas_firstscores.csv
- ???

