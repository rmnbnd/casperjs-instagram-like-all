var utils = require('utils');
var casper = require('casper').create();
var fs = require('fs');

var options = casper.cli.options;

var username = casper.cli.raw.get("username");
var password = casper.cli.raw.get("password");
var followerQueryId = casper.cli.raw.get("follower_query_id");
var userId = casper.cli.raw.get("user_id");
var mediaQueryId = casper.cli.raw.get("media_query_id");

var followers = [];
var pageInfoFollower;
var index = 0;
var existMediaCount = 0;
var medias = [];
var indexMedia = 0;
var token;
var initMediaPageInfo = null;
var allLiked = 0;

casper.on('remote.message', function (msg) {
    this.echo('remote message caught: ' + msg);
});

casper.base64encodeWithHeaders = function (url, method, data, headers) {
    return casper.evaluate(function (url, method, data, headers) {
        console.log("start");

        function getBinaryWithHeaders(url, method, data, headers) {
            try {
                return sendAjaxWithHeaders(url, method, data, false, {
                    headers: headers
                });
            } catch (e) {
                console.log("ERROR!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
                console.log(e);
                console.log(url);
                console.log("ERROR!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");

                if (e.name === "NETWORK_ERR" && e.code === 101) {
                    __utils__.log("getBinary(): Unfortunately, casperjs cannot make cross domain ajax requests", "warning");
                }
                __utils__.log("getBinary(): Error while fetching " + url + ": " + e, "error");
                return "";
            }
        }

        function sendAjaxWithHeaders(url, method, data, async, settings) {
            var xhr = new XMLHttpRequest(),
                dataString = "",
                dataList = [];
            method = method && method.toUpperCase() || "GET";
            var contentType = settings && settings.contentType || "application/x-www-form-urlencoded";
            xhr.open(method, url, !!async);
            __utils__.log("sendAJAX(): Using HTTP method: '" + method + "'", "debug");
            if (settings && settings.overrideMimeType) {
                xhr.overrideMimeType(settings.overrideMimeType);
            }
            xhr.setRequestHeader("Content-Type", contentType);
            if (settings && settings.headers) {
                for (var header in settings.headers) {
                    if (settings.headers.hasOwnProperty(header)) {
                        xhr.setRequestHeader(header, settings.headers[header]);
                    }
                }
            }
            xhr.send(method === "POST" ? dataString : null);
            return xhr.responseText;
        }

        var response = getBinaryWithHeaders(url, method, data, headers);
        console.log("end");
        return response;
    }, url, method, data, headers);
};

casper.options.onResourceRequested = function (C, requestData, request) {
    if (requestData.method === 'POST') {
//        utils.dump(requestData); 
        var headers = requestData.headers;
        for (var header in headers) {
            if (headers[header].name === 'X-CSRFToken') {
                token = headers[header].value;
            }
        }
    }
};
casper.options.onResourceReceived = function (C, response) {
//    utils.dump(response);
};

casper.start('https://www.instagram.com/accounts/login/?hl=ru', function () {
    casper.capture('1.start-login.png');
});

casper.then(function () {
    this.waitForSelector("form");
});

casper.then(function () {
    this.fill("form", {
        'username': username,
        'password': password
    }, true);
    casper.capture('2.login.png');
});

casper.wait(20000, function () {
    this.capture('3.main-page.png');
});

casper.then(function () {
    utils.dump("start get followers " + new Date());
    this.then(getNextFollowers);
});

function getNextFollowers() {
    utils.dump("start get part followers " + new Date());

    var partOffollowers = casper.evaluate(function (pageInfoFollower, followerQueryId, userId) {
        var url = "https://www.instagram.com/graphql/query/?query_id=" + followerQueryId + "&variables={\"id\":" + userId + ",\"first\":20";
        console.log(url);
        if (pageInfoFollower) {
            url += ",%22after%22:%22" + pageInfoFollower.end_cursor + "%22}"
        } else {
            url += "}";
        }
        return JSON.parse(__utils__.sendAJAX(url, "GET"));
    }, pageInfoFollower, followerQueryId, userId);

    followers = followers.concat(partOffollowers.data.user.edge_follow.edges);

    pageInfoFollower = partOffollowers.data.user.edge_follow.page_info;

    utils.dump("end get part followers " + new Date());

    if (partOffollowers.data.user.edge_follow.page_info.has_next_page) {
        casper.then(function () {
            casper.wait(10000, getNextFollowers)
        });
    } else {
        casper.then(function () {
            utils.dump("end get followers " + new Date());
            utils.dump(followers.length);

            utils.dump("start get media " + new Date());
            pageInfoFollower = null;
            getNextMediaByFollower(initMediaPageInfo);
        });
    }
}

function getNextMediaByFollower(pageInfo) {
    utils.dump("start get part of media " + new Date());
    var follower = followers[index];
    var partOfMedia = casper.evaluate(function (f, pageInfo, mediaQueryId) {
        var url = "https://www.instagram.com/graphql/query/?query_id=" + mediaQueryId + "&variables={\"id\":" + f.node.id + ",\"first\":20";
        if (pageInfo) {
            url += ",\"after\":\"" + pageInfo.end_cursor + "\"}"
        } else {
            url += "}";
        }
        var response = __utils__.sendAJAX(url, "GET");
        if (!response) {
            console.log(response);
        }
        console.log(url);
        return JSON.parse(response);
    }, follower, pageInfo, mediaQueryId);

    if (!partOfMedia) {
        utils.dump(follower);
        utils.dump(index);
        utils.dump(pageInfo);
    }
    existMediaCount = partOfMedia.data.user.edge_owner_to_timeline_media.count;

    medias = medias.concat(partOfMedia);

    pageInfo = partOfMedia.data.user.edge_owner_to_timeline_media.page_info;

    casper.then(function () {
        indexMedia = 0;
        like(follower, partOfMedia, pageInfo);
    });
}

function like(follower, partOfMedia, pageInfo) {
    utils.dump("start like of part media " + new Date());
    utils.dump("index media " + indexMedia);
    var media = partOfMedia.data.user.edge_owner_to_timeline_media.edges[indexMedia];
    if (indexMedia < partOfMedia.data.user.edge_owner_to_timeline_media.edges.length) {

        casper.evaluate(function (href) {
            history.pushState(null, null, href);
        }, "p/" + media.node.shortcode + "/?taken-by=" + follower.node.username);

        casper.wait(5000, function () {
            utils.dump("start check contains in like folder " + new Date());

            if (fs.exists("data/" + follower.node.username + "/like/" + media.node.shortcode + "_" + media.node.id + ".jpg")) {
                utils.dump("file already contains - data/" + follower.node.username + "/like/" + media.node.shortcode + "_" + media.node.id + ".jpg");

                utils.dump("end check contains in like folder " + new Date());
            } else {
                utils.dump("file doesn't exist in data folder " + new Date());
                var viewPost = casper.evaluate(function (url) {
                    var url = "https://www.instagram.com/" + url;
                    var response = __utils__.sendAJAX(url, "GET");
                    if (!response) {
                        console.log(response);
                    }
                    console.log(url);
                    return JSON.parse(response);
                }, "p/" + media.node.shortcode + "/?__a=1");

                if (!viewPost.graphql.shortcode_media.viewer_has_liked) {
                    casper.wait(75000, function () {
                        utils.dump("start post like " + new Date());

                        var response = casper.base64encodeWithHeaders("https://www.instagram.com/web/likes/" + media.node.id + "/like/", "POST", null, {
                            "x-csrftoken": token
                        });

                        try {
                            response = JSON.parse(response);
                        } catch (error) {
                            response = {
                                status: "fail"
                            }
                        }

                        utils.dump(response);

                        if (response.status === "ok") {
                            utils.dump("start liked post download " + new Date());
                            casper.download(media.node.display_url, "data/" + follower.node.username + "/like/" + media.node.shortcode + "_" + media.node.id + ".jpg");
                            utils.dump("end liked post download " + new Date());
                        } else {
                            utils.dump("start failed liked post download " + new Date());
                            casper.download(media.node.display_url, "data/" + follower.node.username + "/non-like/" + media.node.shortcode + "_" + media.node.id + ".jpg");
                            utils.dump("end failed liked post download " + new Date());
                        }

                        utils.dump("all liked - " + allLiked++);

                        utils.dump("end post like " + new Date());
                    });
                } else {
                    casper.wait(25000, function () {
                        utils.dump("start already liked post download " + new Date());
                        casper.download(media.node.display_url, "data/" + follower.node.username + "/like/" + media.node.shortcode + "_" + media.node.id + ".jpg");
                        utils.dump("end already liked post download " + new Date());
                    });
                }

            }

            casper.then(function () {
                indexMedia++;
                like(follower, partOfMedia, pageInfo);
            });
        });
    } else {
        casper.then(function () {
            if (partOfMedia.data.user.edge_owner_to_timeline_media.page_info.has_next_page) {
                casper.then(function () {
                    casper.wait(60000, function () {
                        utils.dump("go to next data" + new Date());
                        getNextMediaByFollower(pageInfo);
                    });
                });
            } else {
                if (index < followers.length) {
                    casper.wait(60000, function () {
                        index++;
                        getNextMediaByFollower(null);
                    });
                } else {
                    utils.dump("end get media " + new Date());
                }
            }
        });
    }
}


casper.run();