let fs = require('fs');
const express = require('express');
const request = require('request');
const bodyParser = require('body-parser');
const querystring = require('querystring');
const firebase = require('firebase');

console.log('Running api.js');

spotifyCredentials = JSON.parse(fs.readFileSync('spotify-credentials.json'));
firebaseCredentials = JSON.parse(fs.readFileSync('firebase-credentials.json'));
const firebaseApp = firebase.initializeApp(firebaseCredentials);
const database = firebaseApp.database();

const spotify_client_id = spotifyCredentials['clientId']; // Your client id
const spotify_client_secret = spotifyCredentials['clientSecret']; // Your secret
const spotify_redirect_uri = spotifyCredentials['redirectUri']; // Your redirect uri

const router = express.Router();

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
let generateRandomString = function (length) {
    let text = '';
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};

let stateKey = 'spotify_auth_state';

// var app = express();

// app.use(express.static(__dirname + '/public'))
//     .use(cookieParser());

// login logic

router.get('/login', function (req, res) {

    var state = generateRandomString(16);
    res.cookie(stateKey, state);

    // your application requests authorization
    var scope = 'user-read-private user-read-email';
    res.redirect('https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code',
            client_id: spotify_client_id,
            scope: scope,
            redirect_uri: spotify_redirect_uri,
            state: state
        }));
});

router.get('/auth-callback', function (req, res) {

    // your application requests refresh and access tokens
    // after checking the state parameter

    var code = req.query.code || null;
    var state = req.query.state || null;
    var storedState = req.cookies ? req.cookies[stateKey] : null;

    if (state === null || state !== storedState) {
        res.redirect('/#' +
            querystring.stringify({
                error: 'state_mismatch'
            }));
    } else {
        res.clearCookie(stateKey);
        var authOptions = {
            url: 'https://accounts.spotify.com/api/token',
            form: {
                code: code,
                redirect_uri: spotify_redirect_uri,
                grant_type: 'authorization_code'
            },
            headers: {
                'Authorization': 'Basic ' + (new Buffer(spotify_client_id + ':' + spotify_client_secret).toString('base64'))
            },
            json: true
        };

        request.post(authOptions, function (error, response, body) {
            if (!error && response.statusCode === 200) {

                var access_token = body.access_token,
                    refresh_token = body.refresh_token;

                var options = {
                    url: 'https://api.spotify.com/v1/me',
                    headers: {'Authorization': 'Bearer ' + access_token},
                    json: true
                };

                // use the access token to access the Spotify Web API
                request.get(options, function (error, response, body) {
                    // console.log(body);
                });

                // we can also pass the token to the browser to make requests from there
                res.redirect('/#' +
                    querystring.stringify({
                        access_token: access_token,
                        refresh_token: refresh_token
                    }));
            } else {
                console.log(error);
                res.redirect('/#' +
                    querystring.stringify({
                        error: 'invalid_token'
                    }));
            }
        });
    }
});

router.get('/refresh_token', function (req, res) {

    // requesting access token from refresh token
    var refresh_token = req.query.refresh_token;
    var authOptions = {
        url: 'https://accounts.spotify.com/api/token',
        headers: {'Authorization': 'Basic ' + (new Buffer(spotify_client_id + ':' + spotify_client_secret).toString('base64'))},
        form: {
            grant_type: 'refresh_token',
            refresh_token: refresh_token
        },
        json: true
    };

    request.post(authOptions, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            var access_token = body.access_token;
            res.send({
                'access_token': access_token
            });
        }
    });
});

// other logic

router.post('/add-album/:id', function (req, finalRes) {
    const albumId = req.params.id;
    // console.log(req.params);
    // console.log(req.body);

    const requestURL = 'https://api.spotify.com/v1/albums/' + albumId;

    request({
        url: requestURL,
        method: 'GET',
        auth: {
            'bearer': req.body.access_token
        }
    }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            const albumInfo = JSON.parse(body);

            // console.log(albumInfo);
            const artistID = albumInfo.artists[0].id;

            request({
                url: 'https://api.spotify.com/v1/artists/' + artistID,
                method: 'GET',
                auth: {
                    'bearer': req.body.access_token
                }
            }, function (error, response, body) {
                if (!error && response.statusCode === 200) {
                    const artistInfo = JSON.parse(body);
                    // console.log(artistInfo);
                    const genres = artistInfo.genres;

                    addToDatabase(albumInfo, genres);

                    finalRes.send(albumInfo.name);
                } else {
                    console.log(error);
                    console.log(response);

                    finalRes.send('Invalid album link');
                }
            });
        } else {
            console.log(error);
            console.log(response);

            finalRes.send('Invalid album link');
        }
    });
});

addToDatabase = function (album, genres) {
    // console.log('GENRESDATA');
    // console.log(genres);
    const tracks = album.tracks.items;
    // console.log('TRACKDATA');
    // console.log(tracks);
    const songData = [];
    for (let i = 0; i < tracks.length; i++) {
        songData.push({
            'id': tracks[i].id,
            'duration-sec': tracks[i].duration_ms / 1000
        });
    }
    // console.log('TRACKDATA');
    // console.log(songData);


    for (let i = 0; i < genres.length; i++) {
        database.ref('genre-directory/' + genres[i]).set(genres[i]);
        for (let j = 0; j < songData.length; j++) {
            database.ref('song-ids/' + genres[i] + '/' + songData[j].id).set(songData[j]);
        }
    }
};

shuffle = function (a) {
    let j, x, i;
    for (i = a.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        x = a[i];
        a[i] = a[j];
        a[j] = x;
    }
    return a; // Note: This is an in place shuffle, so a return statement is not necessary
};

router.get('/genre-list', function (req, res) {
    database.ref('/genre-directory').once('value').then(function (snapshot) {
        const genreList = Object.keys(snapshot.val());
        res.send(genreList);
    });
});

router.post('/create-playlist', function (req, finalRes) {
    // database.ref('/genre-directory').once('value').then(function(snapshot) {
    //     const genreList = Object.keys(snapshot.val());
    //     res.send(genreList);
    // });
    const accessToken = req.body.access_token;
    const targetLengthSec = req.body.target_length_mins * 60;
    const playlistName = req.body.playlist_name;
    const genreBreakdown = JSON.parse(req.body.genre_breakdown);
    // console.log(req.body);
    // console.log(genreBreakdown);
    const genres = Object.keys(genreBreakdown);

    for (let i = 0; i < genres.length; i++) {
        const genre = genres[i];
        genreBreakdown[genre] = Number(genreBreakdown[genre]);
        if (genreBreakdown[genre] === 0) {
            delete genreBreakdown[genre];
        }
    }

    // console.log(genreBreakdown);

    let totalLength = 0;
    for (let i = 0; i < genres.length; i++) {
        const genre = genres[i];
        totalLength += genreBreakdown[genre];
    }

    let lengthThresholds = [];
    for (let i = 0; i < genres.length; i++) {
        const genre = genres[i];
        let length = genreBreakdown[genre];
        lengthThresholds[i] = Math.round(targetLengthSec * length / totalLength);
        if (i > 1) {
            lengthThresholds[i] += lengthThresholds[i - 1];
        }
    }

    // console.log(genres);
    // console.log(lengthThresholds);

    // console.log(totalLength);
    // console.log(targetLengthSec);

    const result = [];
    const resultSet = new Set();

    createPlaylist(genres, 0, lengthThresholds, accessToken
        , result, resultSet, 0, playlistName)
});

function createPlaylist(genres, genreIndex, lengthThresholds, accessToken, result, resultSet, currLength, playlistName) {
    if (genreIndex >= genres.length) {
        // create playlist
        console.log(result);
    } else {
        database.ref('/song-ids/' + genres[genreIndex]).once('value').then(function (snapshot) {
            // console.log(snapshot.val());
            // console.log(Object.values(snapshot.val()));
            const genreSongs = shuffle(Object.values(snapshot.val()));
            // console.log(genreSongs);

            let newSongsAvailable = false;
            for (let i = 0; i < genreSongs.length; i++) {
                newSongsAvailable = newSongsAvailable || (!resultSet.has(genreSongs[i].id));
            }

            let i = 0;

            let thisGenreSet = new Set();

            while (currLength < lengthThresholds[genreIndex]) {
                const id = genreSongs[i].id;
                if (!newSongsAvailable || !resultSet.has(id)) {
                    thisGenreSet.add(id);
                    result.push(id);
                    currLength += genreSongs[i]['duration-sec'];
                }
                i = (i + 1) % genreSongs.length;
            }

            for (let item of thisGenreSet) resultSet.add(item);

            // console.log(result.length);

            createPlaylist(genres, genreIndex + 1, lengthThresholds, accessToken, result, resultSet, currLength, playlistName);
        });
    }
}

console.log('Set express router');

console.log('Using body parser');

router.use(bodyParser.json());       // to support JSON-encoded bodies
router.use(bodyParser.urlencoded({     // to support URL-encoded bodies
    extended: true
}));

console.log('Defining Functions');

console.log('Exporting router');
module.exports = router;
