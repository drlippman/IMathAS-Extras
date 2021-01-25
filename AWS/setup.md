# Setting up IMathAS on AWS Beanstalk

This describes the process for setting up an IMathAS installation in AWS using 
RDS and Beanstalk.  This is not a good choice for a small installation,
which could be run much cheaper on a single server, but is a reasonable choice
if you need extremely high reliability and scalability.

## Assumptions

This document assumes you know the basics of working in AWS, like setting up
IAM user accounts with restricted access, the basics of Ops, like creating
databases, and the basics of using Git.

## Preparations

### Create a Git Repo 

Either fork the IMathAS git repo, or create a new repo with IMathAS as an
upstream.  

### Install and configure

On your dev machine, setup your dev webserver to point to this repo.  Create
a database on your dev webserver and create a new database and a database
user/password.

From the browser, access `install.php` from the repo.  Follow the steps to 
do the initial configuration and setup the database.

Once this is complete, edit the generated `config.php`.  For ease of dev testing
and deployment, you may wish to break part of the config into local and 
production segments.  For example you could use:

```
$configEnvironment = empty(getenv('CONFIG_ENV')) ? 'development' : getenv('CONFIG_ENV');
if ($configEnvironment == 'development') {
  require(__DIR__.'/local_config.php');
} else {
  require(__DIR__.'/prod_config.php');
}
```

Move into the `local_config.php` all the local-specific variable definitions, 
like `$imasroot`, `$dbserver`, `$dbname`, `$dbusername`, and `$dbpasssword`.

In the `prod_config.php`, define those variables using `get_env` where 
appropriate.  For example it might have

```
$dbname = 'imathasdb';
$imasroot = '';
$dbserver = getenv('DB_SERVER');
$dbusername = getenv('DB_USERNAME');
$dbpassword = getenv('DB_PASSWORD');
$AWSkey = getenv('AWS_ACCESS_KEY_ID');
$AWSsecret = getenv('AWS_SECRET_KEY');
$CFG['GEN']['AWSforcoursefiles'] = true;
```

Make sure your main config.php also contains:

```
$CFG['GEN']['doSafeCourseDelete'] = true;
$CFG['GEN']['newpasswords'] = "only";
$CFG['GEN']['noEmailButton'] = true;
$CFG['skip_firstscores'] = true;
```

Commit the main `config.php` and the `prod_config.php` to your repo, along with 
the `loginpage.php`, `infoheader.php`, and `newinstructor.php` files generated
during the install.  Make sure no sensitive information is in these files; the
`getenv` is used to protect those.

### Add Beanstalk extensions

In a `.ebextensions` directory of your repo, copy in these files, if desired,
and commit.

#### 01run.config

runs security updates

#### blacklist_addtrust_ca.config

Blacklists an out-of-date certificate

#### cgi.config

Loads cgi modules, used for mimetex

#### custom_log.config

Adjusts the log format to include the user's IP rather than just the load
balancer's.

#### deflate.config

Turns on gzip for a bunch of mime types

#### mimetex.config

Pulls a compiled mimetex binary from S3.  The config.php then uses
`$mathimgurl = "/cgi-bin/mimetex64.cgi";`

#### packages.config

Installs freetype-devel.  Not sure if this is really necessary, but may be
for image-based graph generation with text.

#### phpini.config

Extends the default max_filesize and similar parameters in php.ini.

#### redis.config

Optional.  Only needed if using redis for session store. By default, the
MySQL database is used, and that'll work fine for most installations.  If you 
decide to use redis for sessions, you'll need to add 
`$CFG['redis'] = getenv('REDIS_SERVER');` to your `config.php`, and the 
REDIS_SERVER to the Beanstalk environment properties.  The address should look
like `tcp://site.cache.amazonaws.com:6379`

## Setting up the Environment

### SSL

Go to the AWS Certificate Manager 

- Under Provision certificates click Get Started
- Request a public certificate
- Put in your domain name. You may wish to create a wildcard cert.
- Follow the process to validate your domain


### RDS

In AWS, go to RDS and create a new MySQL database.  Use the latest 5.x version.
Give the database a simple identifier, like `prod`, and setup a master username
and password.

Pick an instance size based on your expected load.  A db.m5.large is big enough
for 100k+ students.  A t3 instance might be sufficient if you have much lower
traffic.

For storage type, General Purpose SSD is fine.  Allocate whatever storage you
think you'll need.

For high-availability, enable the Multi-AZ deployment.

In Connectivity, use the default VPC (unless you want to create a new one).

Password authentication is fine.

For setting up the database, you have two choices:
1. Put in an "Initial database name" here under Additional configuration, then
once the code is deployed run `setupdb.php` via the browser to setup the database, or
2. Use an external tool, like MySQL Workbench, to load in a dump of the database
you setup on your dev environment. 

Under Additional configuration, the default settings for Backup, Encryption, and
Monitoring are probably fine.

### Beanstalk

Next, go to Elastic Beanstalk.  As a note, we're creating the database outside
of Beanstalk so that if ever need to rebuild the environment, we won't lose the
database.

In Beanstalk, click Create Application
* Select Web server environment
* Give it a name
* For platform, choose PHP 7.3 (or higher) running on 64 bit Amazon Linux 2
* For Application code, select Upload your code.  Now export your git repo 
 (using `git archive` or a GUI tool) and upload that file as your code.
* Select the Configure more options 
* Software:
  * Zlib output compression: On
  * Instance log streaming to CloudWatch logs: optional, but can be helpful
  * Environment properties: add properties for any of the `getenv` values you
    included in your `prod_config.php`.  In particular make sure you have the 
    database username, password, and server.  Also be sure to define `CONFIG_ENV`
    if you used that in your config.php branching logic.
* Instances:
  * Root volume: General Purpose SSD, 8 GB
  * EC2 security groups: select default
* Capacity:
  * For a scalable environment, use Load balanced.  Set the min and max as desired.
  * Instance type: Can vary based on traffic.  m3.medium is good size, but old
    technology.  t3.medium could work, but you'd have to watch CPU use.
  * Scaling triggers:  
    * Metric: CPUUtilization
    * Statistic: Average
    * Unit: Percent
    * Period and breach duration: 5min
    * Upper threshold: 70%, scaleup 1
    * Lower threshold: 40%, scaledown -1
* Load balancer
  * Add listener for port 443, protocol HTTPS. 
  * Choose the SSL certificate you created earlier.
* Security
  * EC2 key pair:  Choose a pair if you already have one.  If you don't, it should
    autocreate a pair when you create the environment.  Be sure to save the 
    private key in a secure place.
* Network
  * Choose the default VPC
  * Visibility: public
  * Load balancer subnets: Choose whichever you'd like
  * Instance settings: Choose whatever subnets you'd like.  You may want to assign 
    a Public IP address to your instances, if you want to be able to use one as 
    a bastian server for accessing the database.  But you can also leave them 
    private and use a separate bastian when needed.
* Database: don't do anything here - we're running the database outside of Beanstalk

To check on:  Security group settings, between Beanstalk and RDS 

### DNS

Ideally you should use Route 53 for DNS:
- Create an A record
- Alias: Yes
- Alias Target: select your beanstalk environment

That will require first setting up a Hosted Zone and nameservers and such.

Alternatively you may be able to create a CNAME record that maps 
`www.yoursite.com` to your Beanstalk environment URL.

## Other services

### S3

File storage requires S3.  

#### Create bucket

In S3, create a bucket.  Under Set Permissions,
be sure to un-check the "Block all public access" option.

Record the bucket name in your `prod_config.php` as `$AWSbucket = 'bucketname';`

#### Create access key

In IAM, 
- create a new user named `S3-key-holder`
- Set Access Type to "programatic access"
- Under Set Permissions, choose Attach existing policies directly.
- In the filter type S3, the select the AmazonS3FullAccess policy
- When you create the user copy the Access key ID and Secret access key

Add these to your Beanstalk environment properties as `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_KEY`

In your `prod_config.php` make sure you have the lines

```
$AWSkey = getenv('AWS_ACCESS_KEY_ID');
$AWSsecret = getenv('AWS_SECRET_KEY');
```


### SES

SES is used for reliably sending emails.  You can operate the site without it,
but email notifications won't be reliably delivered.  


#### Verify domains

Under Domains, verify your domain name.  

Under Email Addresses, enter and verify some email addresses.  You'll probably 
want a `do-not-reply@yourdomain.com` for notifications, and an `admin@yourdomain.com`
for account request notifications and other things that might want a reply.

Use these in your config.php, like

```
$sendfrom = "do-not-reply@yourdomain.com";
$accountapproval = "admin@yourdomain.com";
```

#### Create access key

In IAM, 
- create a new user named `SES-key-holder`
- Set Access Type to "programatic access"
- Under Set Permissions, choose Attach existing policies directly.
- In the filter type SES, the select the AmazonSESFullAccess policy
- When you create the user copy the Access key ID and Secret access key

Add these to your Beanstalk environment properties as `SES_KEY_ID` and
`SES_SECRET_KEY`

In your `prod_config.php` add these lines, using the correct region identifier:

```
$CFG['GEN']['useSESmail'] = true;
$CFG['email']['handlerpriority'] = 0;
$CFG['email']['SES_KEY_ID'] = getenv('SES_KEY_ID');
$CFG['email']['SES_SECRET_KEY'] = getenv('SES_SECRET_KEY');
$CFG['email']['SES_SERVER'] = 'email.<region>.amazonaws.com';
```

### Triggers

Certain features need timed operations.  For that, we can use Cloudwatch rules
to trigger these events. None of these features are essential.

#### LTI Queue

The only highly recommeneded feature is the LTI update queue.  Without this,
the system tries to send LTI updates immediately with no recourse if it fails. 
The LTI queue manages this better.

To go SNS.
- Click on Topics, and Create topic
- Name it "LTIqueue"
- Under Delivery retry policies, uncheck "Use the default delivery retry policy"
  and set the number of retries to 0.
- After creating the topic, click the Create subscription
- Protocol: HTTPS
- Endpoint: https://yoursite.com/admin/processltiqueue.php?authcode=<accesscode>,
  picking something for the <accesscode>.
- Under Delivery retry policies, uncheck "Use the default delivery retry policy"
  and set the number of retries to 0.
  
In your Beanstalk environment properties, add a `SNS_AUTHCODE` entry with the 
accesscode you used above.

In your `prod_config.php` add the lines:
```
$CFG['LTI']['authcode'] = getenv('SNS_AUTHCODE');
$CFG['LTI']['usequeue'] = true;
```
  
In CloudWatch
- Click on Events: Rules.
- Click Create rule
- Event Source: Schedule
- Fixed rate of: 1 minute
- Click Add target, and select SNS Topic, then your LTIqueue topic.
- Give the rule a name and Create rule

#### tagforcleanup / runcleanup

These scripts clear out very old student data.  

In Simple Notification Service:
- Create a topic for tagcoursecleanup
- Under Delivery retry policies, uncheck "Use the default delivery retry policy"
  and set the number of retries to 0.
- Select the topic, and under Actions select Subscribe to Topic
- For protocol choose `HTTPS`
- For endpoint use: `https://yoursite.com/util/tagcoursecleanup.php?authcode=###`, 
  where ### is the authcode you put in config.php as `$CFG['cleanup']['authcode']`
- From the Subscriptions page, select the subscription and select 
  "Edit Subscription Delivery Policy" from the Actions pulldown.  Set Number of Retries to 0.
- Repeat, creating a topic and subscription for runcoursecleanup, 
  with an endpoint of `https://yoursite.com/util/runcoursecleanup.php?authcode=###` 

In Cloudwatch:
- Under Rules, create a new rule
- Use Schedule: `0 9 * * ? *`
- Under Add Target, select SNS Topic and select the one you set up earlier for tagcoursecleanup
- Create another rule, with schedule:  `0/10 07-12 * * ? *`
- Under Add Target, select SNS Topic and select the one you set up earlier for runcoursecleanup

#### SES bounce

This handles email bounces and complaints.

In Simple Notification Service:
- Create a topic for ses-bounce
- Under Delivery retry policies, uncheck "Use the default delivery retry policy"
  and set the number of retries to 0.
- Select the topic, and under Actions select Subscribe to Topic
- For protocol choose `HTTPS`
- For endpoint use: `https://yoursite.com/admin/handleSESbounce.php?authcode=###`, 
  where ### is the authcode you put in config.php as `$CFG['email']['authcode']`
- From the Subscriptions page, select the subscription and select 
  "Edit Subscription Delivery Policy" from the Actions pulldown.  Set Number of Retries to 0.

In SES:
- Click on your domain, and open up the Notifications grouping, and click Edit Configuration
- For bounces and complaints, select the ses-bounce SNS topic you created earlier


#### dbbackup

AWS maintains automated backups, but those expire in 7 days.  If you require
longer-term backups, this uses a Lambda function to copy the automated snapshots
to rotating longer-term manual snapshots.

- In Lambda:
    - Create a new function using Node 6
    - Code entry: inline
    - Handler: index.handler
    - Code:  Copy from `dbcopy.js` in this repo, being sure to edit the DB_IDENTIFIER
- In Cloudwatch:
	- Under Rules, create a new rule
	- Use Schedule: `0 10 ? * SUN *`
	- Add Target:  Lambda function, and select the function you created
