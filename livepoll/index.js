var app = require('express')();
//var http = require('http').Server(app);
//var io = require('socket.io')(http);
var https = require('https');
var fs = require('fs');
var crypto = require('crypto');

var livepollpassword = "testing";

var options = {
  key: fs.readFileSync(__dirname + '/certs/privkey.pem'),
  cert: fs.readFileSync(__dirname + '/certs/fullchain.pem'),
  ca: fs.readFileSync(__dirname + '/certs/chain.pem')
};

var server = https.createServer(options, app);
server.listen(3000);
var socketio = require('socket.io');
var io = socketio.listen(server);

app.get('/ping', function(req,res) {
  res.send('pong');
});

app.get('/qscored', function(req, res){
  var aid = req.query.aid.toString();
  var qn = req.query.qn.toString();
  var userid = req.query.user.toString();
  var score = req.query.score.toString();
  var now = req.query.now.toString();
  var la = req.query.la.toString();
  var sig = req.query.sig;
  
  if (sha1(aid+qn+userid+score+la+livepollpassword+now)!=sig) {
	  res.send('signature error');
  	  console.log("signature error on qscored");
  	  return;
  }

  io.to(aid+"-teachers").emit("livepoll qans", {user:userid, score:score, ans:la}); 
  res.send('success');
});

app.get('/startq', function(req, res) {
  var aid = req.query.aid.toString();
  var qn = req.query.qn.toString();
  var seed = req.query.seed.toString();
  var startt = req.query.startt.toString();
  var now = req.query.now.toString();
  var sig = req.query.sig;

  var tocheck = aid+qn+seed+livepollpassword+now;
  if (sha1(tocheck)!=sig) {
	  res.send('signature error:' + tocheck+":"+sha1(tocheck)+":"+sig);
  	  console.log("signature error on startq");
  	  return;
  }
  
  io.to(aid+"-students").emit("livepoll show", {action: "showq", qn: qn, seed: seed, startt:startt});
  res.send('success');
});

app.get('/stopq', function(req, res) {

  var aid = req.query.aid.toString();
  var qn = req.query.qn.toString();
  var newstate = req.query.newstate.toString();
  var now = req.query.now.toString();
  var sig = req.query.sig;

  if (sha1(aid+qn+newstate+livepollpassword+now)!=sig) {
	  res.send('signature failure');
  	  console.log("signature error on stopq");
  	  return;
  }
  
  io.to(aid+"-students").emit("livepoll show", {action: newstate, qn: qn});
  res.send('success');
});


io.on('connection', function(socket){
  var room = socket.handshake.query.room.toString();
  var now = socket.handshake.query.now.toString();
  var sig = socket.handshake.query.sig;

  if (sha1(room+livepollpassword+now)!=sig) {
  	  console.log("signature error on connect");
  	  return;
  }
  
  socket.join(room);

  var roompts = room.split(/-/);
  var aid = roompts[0];
  updateUserCount(aid);

  socket.on('disconnect', function(){
    //console.log('user disconnected');
    updateUserCount(aid);
  });  

});

function updateUserCount(aid) {
  var sturoom = io.sockets.adapter.rooms[aid+"-students"];
  if (sturoom) {
    var usrcnt = sturoom.length;
  } else {
    var usrcnt = 0;
  }

  var teachroom = io.sockets.adapter.rooms[aid+"-teachers"];
  if (teachroom) {
    var teachcnt = teachroom.length;
  } else {
    var teachcnt = 0;
  }
  io.to(aid+"-teachers").emit("livepoll usercount", {teachcnt: teachcnt, cnt:usrcnt});
  io.to(aid+"-students").emit("livepoll usercount", {teachcnt: teachcnt, cnt:usrcnt});
}

function sha1(data) {
	var generator = crypto.createHash('sha1');
	generator.update(data);
	return generator.digest('base64');
}

//http.listen(3000, function(){
//  console.log('listening on *:3000');
//});
