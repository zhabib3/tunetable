let fs = require('fs');
const express = require('express');
const request = require('request');
const bodyParser = require('body-parser');
const querystring = require('querystring');

console.log('Running api.js');

spotifyCredentials = JSON.parse(fs.readFileSync('spotify-credentials.json'));

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

        console.log('HERE');
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
                    console.log(body);
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

router.get('/add-album/:id', function (req, finalRes) {
    const albumId = req.params.id;
    console.log(req.params);
    //
    // request.post(
    //     'http://www.yoursite.com/formpage',
    //     { json: { key: 'value' } },
    //     function (error, response, body) {
    //         if (!error && response.statusCode === 200) {
    //             console.log(body)
    //         }
    //     }
    // );

    const requestURL = 'https://api.spotify.com/v1/albums/' + albumId;

    var options = {
        url: requestURL,
        headers: {
            'User-Agent': 'request'
        }
    };

    request.get(options,
        function (error, response, body) {
        if (!error && response.statusCode === 200) {
            console.log(body)
        } else {
            // console.log(error);
            // console.log(response);
        }
    });
});

console.log('Set express router');

console.log('Using body parser');

router.use(bodyParser.json());       // to support JSON-encoded bodies
router.use(bodyParser.urlencoded({     // to support URL-encoded bodies
    extended: true
}));

console.log('Defining Functions');

console.log('Exporting router');
module.exports = router;
