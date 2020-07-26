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
    // TODO implement
    
    var DB_IDENTIFIER = "**EDIT ME**";

    rds.describeDBSnapshots({  //get list of automated snapshots
	    DBInstanceIdentifier: DB_IDENTIFIER,
	    SnapshotType: "automated"
    }, function(err, data) {
	    if (err) { 
		    console.log(err, err.stack);
	    } else {
    		data.DBSnapshots.sort(function(a,b) {  //sort by creation date
    		    return (a.SnapshotCreateTime<b.SnapshotCreateTime)?1:-1
    		});
    		var source_dbidentifier = data.DBSnapshots[0].DBSnapshotIdentifier; //get ID of latest snapshot
    		//find "number of weeks since Jan 1 2018"
    		var week_count = Math.floor((Date.now() - Date.parse("Jan 1 2018"))/(7*24*60*60*1000));
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
