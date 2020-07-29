# Generating institution data tables

Download the CSV data files as described below.  Then run `ipeds2sql.php` to
generate a SQL file to load into the database.  You can edit the `ipeds2sql.php`
to omit certain datasets if desired.

## Public Schools

Use the [NCES Elsi Table Generator](https://nces.ed.gov/ccd/elsi/tableGenerator.aspx)

1. Table row: Public School
2. Year: most recent
3. Table Columns:
  * State Abbr
  * School Name
  * Agency Name
  * Agency ID
  * Location ZIP
4. Filters: State: All 50 States + DC + Outlying Areas
5. Create Table
6. Download as CSV
7. After download, delete excess rows from top and bottom of table, keeping header row

## Private Schools

Use the [NCES Elsi Table Generator](https://nces.ed.gov/ccd/elsi/tableGenerator.aspx)

1. Table row: Private School
2. Year: most recent
3. Table Columns:
  * Private School Name
  * School ID
  * State Abbr
  * ZIP
4. Filters: State: All 50 States + DC + Outlying Areas
5. Create Table
6. Download as CSV
7. After download, delete excess rows from top and bottom of table, keeping header row

## Higher Ed

Use the [IPEDS Custom Data File](https://nces.ed.gov/ipeds/datacenter/InstitutionByName.aspx?goToReportId=5)

1. Tab Select Institutions: 
  * By Groups
  * EZ Group
  * All institutions
  * Search
2. Tab Select Variables
  * Open Insitutional Characteristics, Directory information, then select:
  * Institution Name
  * State abbreviation
  * ZIP code
3. Continue
4. Download as CSV

## World

Download from https://github.com/endSly/world-universities-csv

# Table Design

imas_ipeds
* id autoincrement
* ID type 
  * I: IPED unitid
  * S: NCES schoolid
  * A: NCES agencyid
  * C: Custom added school uniqid 
* ipedsid (base on IPEDS unitid and NCES School ID or Agency ID)
  * IPED unitid
  * NCES schoolid
  * NCES agencyid
  * Custom added school uniqid (usually substr(md5(schoolname . country code),0,10))
* School Name
* Agency Name
* Country (2 char)
* State (2 char)
* ZIP (INT)

imas_iped_group
* type
* ipedid
* groupid
* primary key of all three.  No need for autoinc id

