'use strict';
require('classtool');

function spec() {
  var fs = require('fs');
  var CoinConst = require('bitcore/const');
  var coinUtil = require('bitcore/util/util');
  var Sync = require('./Sync').class();
  var Peer = require('bitcore/Peer').class();

  var peerdb_fn = 'peerdb.json';

  function PeerSync() {}


  PeerSync.prototype.init = function(config, cb) {

    var that = this;

    var network = config && (config.network || 'testnet');

    that.peerdb = undefined;
    that.sync = new Sync({
      networkName: network
    });
    that.sync.init(config, function() {
      that.PeerManager = require('bitcore/PeerManager').createClass({
        config: {
          network: network
        }
      });
      that.load_peers();
      return cb();
    });
  };

  PeerSync.prototype.load_peers = function() {
    try {
      this.peerdb = JSON.parse(fs.readFileSync(peerdb_fn));
    } catch(d) {
      console.warn('Unable to read peer db', peerdb_fn, 'creating new one.');
      this.peerdb = [{
        ipv4: '127.0.0.1',
        port: 18333
      },
      ];

      fs.writeFileSync(peerdb_fn, JSON.stringify(this.peerdb));
    }
  };

  PeerSync.prototype.handle_inv = function(info) {
    var invs = info.message.invs;
    invs.forEach(function(inv) {
      console.log('[p2p_sync] Handle inv for a ' + CoinConst.MSG.to_str(inv.type));
    });
    // TODO: should limit the invs to objects we haven't seen yet
    info.conn.sendGetData(invs);
  };

  PeerSync.prototype.handle_tx = function(info) {
    var tx = info.message.tx.getStandardizedObject();
    console.log('[p2p_sync] Handle tx: ' + tx.hash);
    this.sync.storeTxs([tx.hash], null, function(err) {
      if (err) {
        console.log('[p2p_sync] Error in handle TX: ' + err);
      }
    });
  };

  PeerSync.prototype.handle_block = function(info) {
    var block = info.message.block;
    var blockHash = coinUtil.formatHashFull(block.calcHash());
    console.log('[p2p_sync] Handle block: ' + blockHash);


    var tx_hashes = block.txs.map(function(tx) {
      return coinUtil.formatHashFull(tx.hash);
    });

    this.sync.storeBlock({
      'hash': blockHash,
      'tx':   tx_hashes,
      // TODO NEXT BLOCK / PREV BLOCK?
    },
    function(err) {
      if (err) {
        console.log('[p2p_sync] Error in handle Block: ' + err);
      }
    });
  };

  PeerSync.prototype.handle_connected = function(data) {
    var peerman = data.pm;
    var peers_n = peerman.peers.length;
    console.log('[p2p_sync] Connected to ' + peers_n + ' peer' + (peers_n !== 1 ? 's': ''));
  };

  PeerSync.prototype.run = function() {
    var self = this;
    var peerman = new this.PeerManager();

    this.peerdb.forEach(function(datum) {
      var peer = new Peer(datum.ipv4, datum.port);
      peerman.addPeer(peer);
    });

    peerman.on('connection', function(conn) {
      conn.on('inv', self.handle_inv.bind(self));
      conn.on('block', self.handle_block.bind(self));
      conn.on('tx', self.handle_tx.bind(self));
    });
    peerman.on('connect', self.handle_connected.bind(self));

    peerman.start();
  };
  return PeerSync;

}
module.defineClass(spec);
