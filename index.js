var MediaRenderer = require('upnp-mediarenderer-client')
var debug = require('debug')('dlnacasts')
var events = require('events')
var mime = require('mime')

var SSDP
try {
  SSDP = require('ssdp-js')
} catch (err) {
  SSDP = null
}

var thunky = require('thunky')

var noop = function () {}

module.exports = function () {
  var that = new events.EventEmitter()
  var casts = {}
  var ssdp = SSDP ? new SSDP() : null

  that.players = []

  var emit = function (cst) {
    if (!cst || !cst.host || cst.emitted) return
    cst.emitted = true

    var player = new events.EventEmitter()

    var connect = thunky(function reconnect (cb) {
      var client = new MediaRenderer(player.xml)

      client.on('error', function (err) {
        player.emit('error', err)
      })

      client.on('status', function (status) {
        player.emit('status', status)
      })

      client.on('loading', function (err) {
        player.emit('loading', err)
      })

      client.on('close', function () {
        connect = thunky(reconnect)
      })

      player.client = client
      cb(null, player.client)
    })

    player.name = cst.name
    player.host = cst.host
    player.xml = cst.xml

    player.play = function (url, opts, cb) {
      if (typeof opts === 'function') return player.play(url, null, opts)
      if (!opts) opts = {}
      if (!url) return player.resume(cb)
      if (!cb) cb = noop
      player.subtitles = opts.subtitles
      connect(function (err, p) {
        if (err) return cb(err)

        var media = {
          autoplay: opts.autoPlay !== false,
          contentType: opts.type || mime.lookup(url, 'video/mp4'),
          metadata: opts.metadata || {
            title: opts.title || '',
            type: 'video', // can be 'video', 'audio' or 'image'
            subtitlesUrl: player.subtitles && player.subtitles.length ? player.subtitles[0] : null
          }
        }

        var callback = cb
        if (opts.seek) {
          callback = function () {
            player.seek(opts.seek, cb)
          }
        }

        p.load(url, media, callback)
      })
    }

    player.resume = function (cb) {
      if (!cb) cb = noop
      player.client.play(cb)
    }

    player.pause = function (cb) {
      if (!cb) cb = noop
      player.client.pause(cb)
    }

    player.stop = function (cb) {
      if (!cb) cb = noop
      player.client.stop(cb)
    }

    player.status = function (cb) {
      if (!cb) cb = noop
      cb()
    }

    player.volume = function (vol, cb) {
      if (!cb) cb = noop
      var params = {
        InstanceID: player.instanceId,
        Channel: 'Master',
        DesiredVolume: (100 * vol)|0
      };
      player.callAction('RenderingControl', 'SetVolume', params, cb)
    }

    player.request = function (data, cb) {
      if (!cb) cb = noop
      // TODO: make request
    }

    player.seek = function (time, cb) {
      if (!cb) cb = noop
      player.client.seek(time, cb)
    }

    that.players.push(player)
    that.emit('update', player)
  }

  if (ssdp) {
    ssdp.onDevice(function (device) {
      debug('DLNA device %j', device)
      device.host = device.address

      var name = device.name
      if (!name) return

      if (!casts[name] || (casts[name] && !casts[name].host)) {
        casts[name] = device
        return emit(casts[name])
      }
    })
  }

  that.update = function () {
    debug('querying ssdp')
    if (ssdp) ssdp.start()
  }

  that.destroy = function () {
  }

  that.update()

  return that
}
