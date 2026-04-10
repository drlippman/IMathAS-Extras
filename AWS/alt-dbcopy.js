/*
Alternate database copying lambda script, to keep 2 weeks in RDS and store monthlies in S3.
This is based on keeping 7 days in automated backups, so each week we'll copy the oldest 
backup to manual, so that we don't have duplicate snapshots for a week. We keep current 
7 days + 2 weeklies behind it in RDS, and monthlies as exports to S3.

S3 Lifecycle policy — the script starts the export, but you'll want a lifecycle rule on your 
S3 bucket to automatically transition exports to Glacier after 30 days. Do that in the console 
or via CDK/Terraform — it's a one-time setup, not something the Lambda needs to manage.

Lambda timeout — the snapshot copy and describe calls are fast, but make sure your Lambda timeout 
is at least 60 seconds to account for occasional API slowness. The export itself runs outside 
Lambda so timeout isn't a concern there.

IAM permissions — your Lambda role will need rds:StartExportTask, s3:PutObject on your bucket, 
and iam:PassRole for the RDS export role in addition to what it already has.  

Assure the IAM_ROLE_ARN below has access to the S3 bucket and access to the KMS key, and has a
trust relationship for export.rds.amazonaws.com

*/
const {
    RDSClient,
    DescribeDBSnapshotsCommand,
    CopyDBSnapshotCommand,
    DeleteDBSnapshotCommand,
    StartExportTaskCommand
} = require("@aws-sdk/client-rds");

const rds = new RDSClient({});

const DB_IDENTIFIER = "";
const S3_BUCKET = "";
const IAM_ROLE_ARN = "";
const KMS_KEY_ID = "";
const S3_EXPORT_PREFIX = "";

async function copySnapshot(source, dest) {
    // Attempt to delete first in case it already exists, ignore errors
    try {
        await rds.send(new DeleteDBSnapshotCommand({ DBSnapshotIdentifier: dest }));
    } catch (err) {}

    const result = await rds.send(new CopyDBSnapshotCommand({
        SourceDBSnapshotIdentifier: source,
        TargetDBSnapshotIdentifier: dest,
        KmsKeyId: KMS_KEY_ID
    }));
    return result.DBSnapshot;
}

async function deleteSnapshot(snapshotId) {
    try {
        await rds.send(new DeleteDBSnapshotCommand({ DBSnapshotIdentifier: snapshotId }));
        console.log(`Deleted old snapshot: ${snapshotId}`);
    } catch (err) {
        console.log(`Warning: could not delete ${snapshotId}:`, err.message);
    }
}

async function exportSnapshotToS3(snapshotArn, exportId) {
    return rds.send(new StartExportTaskCommand({
        ExportTaskIdentifier: exportId,
        SourceArn: snapshotArn,
        S3BucketName: S3_BUCKET,
        S3Prefix: S3_EXPORT_PREFIX,
        IamRoleArn: IAM_ROLE_ARN,
        KmsKeyId: KMS_KEY_ID
    }));
}

async function getManualSnapshots(prefix) {
    const result = await rds.send(new DescribeDBSnapshotsCommand({
        DBInstanceIdentifier: DB_IDENTIFIER,
        SnapshotType: "manual"
    }));
    return result.DBSnapshots
        .filter(s => s.DBSnapshotIdentifier.startsWith(prefix))
        .sort((a, b) => b.SnapshotCreateTime - a.SnapshotCreateTime); //newest first
}

async function pruneSnapshots(prefix, keep) {
    const snapshots = await getManualSnapshots(prefix);
    const toDelete = snapshots.slice(keep);
    for (const snap of toDelete) {
        await deleteSnapshot(snap.DBSnapshotIdentifier);
    }
}

exports.handler = async (event, context) => {
    // Get the oldest automated snapshot
    const describeResult = await rds.send(new DescribeDBSnapshotsCommand({
        DBInstanceIdentifier: DB_IDENTIFIER,
        SnapshotType: "automated"
    }));

    // oldest first
    const snapshots = describeResult.DBSnapshots.sort((a, b) =>
        a.SnapshotCreateTime - b.SnapshotCreateTime
    );

    if (snapshots.length === 0) {
        console.log("No automated snapshots found");
        return;
    }

    const oldestSnapshot = snapshots[0];
    const sourceId = oldestSnapshot.DBSnapshotIdentifier;

    const now = new Date();
    const dateStr = oldestSnapshot.SnapshotCreateTime.toISOString().slice(0, 10); // e.g. "2025-03-15"
    const isMonthStart = now.getDate() <= 7;

    if (isMonthStart) {
        // Monthly: export to S3
        const monthStr = oldestSnapshot.SnapshotCreateTime.toISOString().slice(0, 7); // e.g. "2025-03"
        const exportId = `${DB_IDENTIFIER}-monthly-${monthStr}`;
        await exportSnapshotToS3(oldestSnapshot.DBSnapshotArn, exportId);
        console.log(`Started S3 export: ${exportId}`);
    }
	await pruneSnapshots(`${DB_IDENTIFIER}-weekly-`, 1);  

    // Weekly: RDS snapshot
    const weeklyId = `${DB_IDENTIFIER}-weekly-${dateStr}`;
    await copySnapshot(sourceId, weeklyId);
    console.log(`Created weekly RDS snapshot: ${weeklyId}`);
};