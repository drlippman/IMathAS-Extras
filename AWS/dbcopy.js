const {
    RDSClient,
    DescribeDBSnapshotsCommand,
    CopyDBSnapshotCommand,
    DeleteDBSnapshotCommand,
    StartExportTaskCommand
} = require("@aws-sdk/client-rds");

const rds = new RDSClient({});

const DB_IDENTIFIER = "EDIT ME";  // like "imathas"
const S3_BUCKET = "EDIT ME";  // like "dbdump"
const IAM_ROLE_ARN = "EDIT ME"; 
const KMS_KEY_ID = "EDIT ME";
const S3_EXPORT_PREFIX = "EDIT ME";  // like "rds-exports/imathas"

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
	// newest first sort
    return result.DBSnapshots
        .filter(s => s.DBSnapshotIdentifier.startsWith(prefix))
        .sort((a, b) => b.SnapshotCreateTime - a.SnapshotCreateTime);
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

	// oldest first sort
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