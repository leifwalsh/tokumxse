// Checks that movePrimary doesn't move collections detected as sharded when it begins moving
var st = new ShardingTest({ shards : 2, mongos : 2, verbose : 1 })

// Stop balancer, otherwise mongosB may load information about the database non-deterministically
st.stopBalancer();

var mongosA = st.s0
var mongosB = st.s1

var adminA = mongosA.getDB( "admin" )
var adminB = mongosB.getDB( "admin" )

var configA = mongosA.getDB( "config" )
var configB = mongosB.getDB( "config" )

// Populate some data
assert.writeOK(mongosA.getCollection("foo.coll0").insert({ hello : "world" }));
assert.writeOK(mongosA.getCollection("bar.coll0").insert({ hello : "world" }));
assert.writeOK(mongosA.getCollection("foo.coll1").insert({ hello : "world" }));
assert.writeOK(mongosA.getCollection("bar.coll1").insert({ hello : "world" }));
assert.writeOK(mongosA.getCollection("foo.coll2").insert({ hello : "world" }));
assert.writeOK(mongosA.getCollection("bar.coll2").insert({ hello : "world" }));

// Enable sharding
printjson( adminA.runCommand({ enableSharding : "foo" }) );
printjson( adminA.runCommand({ enableSharding : "bar" }) );

// Setup three collections per-db
// 0 : not sharded
// 1 : sharded
// 2 : sharded but not seen as sharded by mongosB
printjson( adminA.runCommand({ shardCollection : "foo.coll1", key : { _id : 1 } }) );
printjson( adminA.runCommand({ shardCollection : "foo.coll2", key : { _id : 1 } }) );
printjson( adminA.runCommand({ shardCollection : "bar.coll1", key : { _id : 1 } }) );
printjson( adminA.runCommand({ shardCollection : "bar.coll2", key : { _id : 1 } }) );

// All collections are now on primary shard
var fooPrimaryShard = configA.databases.findOne({ _id : "foo" }).primary
var barPrimaryShard = configA.databases.findOne({ _id : "bar" }).primary

var shards = configA.shards.find().toArray()
var fooPrimaryShard = fooPrimaryShard == shards[0]._id ? shards[0]  : shards[1]
var fooOtherShard = fooPrimaryShard._id == shards[0]._id ? shards[1]  : shards[0]
var barPrimaryShard = barPrimaryShard == shards[0]._id  ? shards[0] : shards[1] 
var barOtherShard = barPrimaryShard._id == shards[0]._id  ? shards[1] : shards[0] 

st.printShardingStatus();

jsTest.log( "Running movePrimary for foo through mongosA ..." )

// MongosA should already know about all the collection states
printjson( adminA.runCommand({ movePrimary : "foo", to : fooOtherShard._id }) )

// All collections still correctly sharded / unsharded
assert.neq( null, mongosA.getCollection("foo.coll0").findOne() );
assert.neq( null, mongosA.getCollection("foo.coll1").findOne() );
assert.neq( null, mongosA.getCollection("foo.coll2").findOne() );

assert.neq( null, mongosB.getCollection("foo.coll0").findOne() );
assert.neq( null, mongosB.getCollection("foo.coll1").findOne() );
assert.neq( null, mongosB.getCollection("foo.coll2").findOne() );

function realCollectionCount( mydb ) {
    var num = 0;
    mydb.getCollectionNames().forEach( function(z) {
        if ( z.startsWith( "coll" ) )
            num++;
    } );
    return num;
}

// All collections sane
assert.eq( 2, realCollectionCount( new Mongo( fooPrimaryShard.host ).getDB( "foo" ) ) );
assert.eq( 1, realCollectionCount( new Mongo( fooOtherShard.host ).getDB( "foo" ) ) );

jsTest.log( "Running movePrimary for bar through mongosB ..." );
printjson( adminB.runCommand({ movePrimary : "bar", to : barOtherShard._id }) );

// All collections still correctly sharded / unsharded
assert.neq( null, mongosA.getCollection("bar.coll0").findOne() );
assert.neq( null, mongosA.getCollection("bar.coll1").findOne() );
assert.neq( null, mongosA.getCollection("bar.coll2").findOne() );

assert.neq( null, mongosB.getCollection("bar.coll0").findOne() );
assert.neq( null, mongosB.getCollection("bar.coll1").findOne() );
assert.neq( null, mongosB.getCollection("bar.coll2").findOne() );

// All collections sane
assert.eq( 2, realCollectionCount( new Mongo( barPrimaryShard.host ).getDB( "bar" ) ) );
assert.eq( 1, realCollectionCount( new Mongo( barOtherShard.host ).getDB( "bar" ) ) );

st.stop();
