// this test makes sure that old journal files are removed

if (db.serverBuildInfo().bits == 32) {
    print("skip on 32 bit systems");    
}
else {
    // tunables
    STRING_SIZE = 1024*1024;
    NUM_TO_INSERT = 2.5*1024;
    PATH = MongoRunner.dataDir + "/dur_remove_old_journals";
    SYNC_DELAY = 5; // must be a number

    var conn = MongoRunner.runMongod({dbpath: PATH,
                                      journal: "",
                                      smallfiles: "",
                                      syncdelay: SYNC_DELAY});
    db = conn.getDB("test");

    longString = 'x';
    while (longString.length < STRING_SIZE)
        longString += longString;

    numInserted = 0;
    while (numInserted < NUM_TO_INSERT){
        db.foo.insert({_id: numInserted++, s:longString});


        if (numInserted % 100 == 0){
            print("numInserted: " + numInserted);
            db.adminCommand({fsync:1});
            db.foo.remove({});
            db.adminCommand({fsync:1});
        }
    }

    sleepSecs = SYNC_DELAY + 15 // long enough for data file flushing and journal keep time
    print("\nWaiting " + sleepSecs + " seconds...\n");
    sleep(sleepSecs*1000);


    files = listFiles(PATH + "/journal")
    printjson(files);

    var nfiles = 0;
    files.forEach(function (file) {
        assert.eq('string', typeof (file.name));    // sanity checking
        if (/prealloc/.test(file.name)) {
            ;
        }
        else {
            nfiles++;
        }
    })

    assert.eq(2, nfiles); // latest journal file and lsn

    MongoRunner.stopMongod(conn);
}

print("*** success ***");
