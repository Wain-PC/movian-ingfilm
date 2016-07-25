/**
 * ingfilm.ru plugin for Showtime
 *
 *  Copyright (C) 2016 Wain
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

var plugin = this,
    PREFIX = 'ingfilm',
    BASE_URL = 'http://ingfilm.ru',
    logo = plugin.path + "logo.png",
    html = require('showtime/html'),
    io = require('native/io'),
    itemData,
    referer;

plugin.createService(plugin.getDescriptor().id, PREFIX + ":start:false", "video", true, logo)

io.httpInspectorCreate('http://ingfilm.ru.*', function (req) {
    req.setCookie('beget', 'begetok;');
    if(referer) {
        req.setHeader('Referer', referer);
    }
});

plugin.addHTTPAuth("http:\/\/.*moonwalk.cc.*", function (authreq) {
    authreq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 6.3; WOW64; rv:42.0) Gecko/20100101 Firefox/42.0');
});


function setPageHeader(page, title) {
    if (page.metadata) {
        page.metadata.title = title;
        page.metadata.logo = logo;
    }
    page.type = "directory";
    page.contents = "items";
    page.loading = false;
}

function makeRequest(page, url, settings, returnUnparsed) {
    var response;
    if (!url) {
        return showtime.message('NO_URL_IN_REQUEST');
    }
    if (!page) {
        return showtime.message('NO_PAGE_OBJECT_IN_REQUEST');
    }
    if (!settings) {
        settings = {
            method: 'GET'
        };
    }

    if (url.indexOf(BASE_URL) !== 0) {
        url = BASE_URL + url;
    }
    page.loading = true;

    response = showtime.httpReq(url, settings);
    page.loading = false;
    if (returnUnparsed) {
        return {
            dom: html.parse(response.toString()).root,
            text: response.toString()
        }
    }
    return html.parse(response.toString()).root;

}


function findItems(page, dom, countEntries) {
    var list = dom.getElementByClassName('short_content'),
        i, length = list.length,
        item,
        url, picture, name, description, quality;

    for (i = 0; i < length; i++) {
        item = list[i];
        url = item.children[0].attributes[0].value;
        picture = item.children[0].getElementByTagName('img')[0].attributes[0].value;
        if (picture) {
            picture = BASE_URL + picture;
        }
        name = getProperty(item, 'short_header');
        quality = getProperty(item, 'qulabel');
        description = getProperty(item, 'short_info');

        page.appendItem(PREFIX + ':item:' + encodeURIComponent(url) + ':' + encodeURIComponent(name) + ':' + encodeURIComponent(picture), 'video', {
            title: quality + ' - ' + name,
            icon: picture,
            description: description
        });

        if (countEntries) {
            page.entries++;
        }
    }
}

function getProperty(item, className) {
    var prop = item.getElementByClassName(className);
    if (!prop.length) {
        return '';
    }
    prop = prop[0].textContent;
    if (prop) {
        return prop.trim();
    }
    return '';
}

function findNextPage(dom, searchMode) {
    var next = dom.getElementByClassName('next');
    if (next.length) {
        next = next[0];
        if (searchMode) {
            return next.children[0].nodeName.toLowerCase() === 'a';
        }
        next = next.children[0].attributes.getNamedItem('href').value;
        return next;
    }
    return false;
}

function metaTag(res, tag) {
    var dom = html.parse(res),
        meta = dom.root.getElementByTagName('meta'),
        attrs;
    for (var i in meta) {
        if (meta.hasOwnProperty(i) && (attrs = meta[i].attributes)) {
            if (attrs.getNamedItem('property') && attrs.getNamedItem('property').value == tag) return attrs.getNamedItem('content').value;
            if (attrs.getNamedItem('name') && attrs.getNamedItem('name').value == tag) return attrs.getNamedItem('content').value;
        }
    }
}


function parseVideoIframe(url) {
    var html, link, re, urlPart, postData;
    urlPart = url.substr(0, 9);
    switch (urlPart) {
        case 'http://mo':
        case /http:\/\/\d+/.test(urlPart):
            html = showtime.httpReq(url, {
                method: 'GET',
                headers: {
                    'Referer': BASE_URL
                }
            }).toString();
            postData = {
                partner: '',
                d_id: html.match(/d_id: '??([\s\S]*?)'??,/)[1].substr(1),
                video_token: html.match(/video_token: '??([\s\S]*?)'??,/)[1].substr(1),
                content_type: html.match(/content_type: '??([\s\S]*?)'??,/)[1].substr(1),
                access_key: html.match(/access_key: '??([\s\S]*?)'??,/)[1].substr(1),
                cd: 0
            };

            link = showtime.JSONDecode(showtime.httpReq('http://moonwalk.cc/sessions/create_session', {
                postdata: postData,
                headers: {
                    "X-CSRF-Token": metaTag(html, "csrf-token"),
                    'Referer': url,
                    'Host': 'moonwalk.cc',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 6.3; WOW64; rv:42.0) Gecko/20100101 Firefox/42.0',
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'Content-Data': Duktape.enc('base64', /(\d{10}\.[a-f\d]+)/.exec(html)[1]),
                    'X-Requested-With': 'XMLHttpRequest'
                }
            }));

            link = 'hls:' + link['manifest_m3u8'];
            break;
        case 'http://vk':
        case 'https://v':
            html = showtime.httpReq(decodeURIComponent(url));
            re = /url720=(.*?)&/;
            link = re.exec(html);
            if (!link) {
                re = /url480=(.*?)&/;
                link = re.exec(html);
            }
            if (!link) {
                re = /url360=(.*?)&/;
                link = re.exec(html);
            }
            if (!link) {
                re = /url240=(.*?)&/;
                link = re.exec(html);
            }
            if (!link) {
                page.error('Видео не доступно. / This video is not available, sorry :(');
                return;
            }
            link = link[1];
            break;
        default:
            break;
    }
    return link;
}

function locateMainPlayerLink(page, url, response) {
    var scriptRegExp = /src="http:\/\/ingfilm\.ru\/player\/api\.php(.*?)">/, scriptUrl, scriptResponse,
        iframeRegExp = /ifrm\.setAttribute\("src", "\/\/(.*?)"/, iframeUrl, iframeResponse,
        playLinkRegExp = /src=\/video\/" \+ token \+ "(.*?) controls/,
        token, playLink,
        seriesData;

    referer = url;
    //Step 1. Locate script and load it
    scriptUrl = scriptRegExp.exec(response.text);
    if (scriptUrl && scriptUrl[1]) {
        scriptUrl = BASE_URL + '/player/api.php' + scriptUrl[1];
        scriptResponse = makeRequest(page, scriptUrl, null, true).text;

        //Step 2. Find IFRAME URL in the script
        iframeUrl = iframeRegExp.exec(scriptResponse);
        if (iframeUrl && iframeUrl[1]) {
            iframeUrl = 'http://' + iframeUrl[1];

            //Replace wrong URL param 'style' with the correct value (1)
            //This is a possible fix for Issue #2
            iframeUrl = iframeUrl.replace(/style=\d+?/, 'style=1');

            //Step 3. Load Iframe content from URL
            iframeResponse = makeRequest(page, iframeUrl, null, true);

            //Step 4. Locate video token and create URL
            token = iframeResponse.dom.getElementById('apiplayer').attributes.getNamedItem('token').value;

            //если мы грузим сериал, то нам нужно составить 2 массива: Сезоны, Озвучки (не всегда есть)
            seriesData = {
                voices: getSeriesData(iframeResponse.dom, 'translator'),
                seasons: getSeriesData(iframeResponse.dom, 'season')
            };


            itemData = seriesData;
            itemData.token = token;
            itemData.kpid = /kpid=(\d+?)&/.exec(iframeUrl)[1];
            itemData.url = /url=(.+?)&/.exec(iframeUrl)[1];

            if (seriesData.voices._length || seriesData.seasons._length) {
                return seriesData;
            }


            playLink = playLinkRegExp.exec(iframeResponse.text);
            if (playLink && playLink[1]) {
                return 'hls:' + BASE_URL + '/video/' + token + playLink[1];
            }
        }
    }
    return false;
}

function getSeriesData(dom, type) {
    var response = [],
        selectOptions,
        initialObject = {};
    selectOptions = dom.getElementById(type);
    if (!selectOptions) {
        return response;
    }

    selectOptions = selectOptions.getElementByTagName('option');
    if (selectOptions.length) {
        Object.defineProperty(initialObject, '_length', {
            value: 0,
            writable: true,
            enumerable: false //it's default value, but I implicitly stated it here, as that's why such syntax has been used here.
        });


        response = selectOptions.reduce(function (res, item) {
            var obj = {
                name: item.textContent,
                value: item.attributes.getNamedItem('value').value
            };

            //для типа voice нужно добавить еще и значение атрибута ID
            if (type === 'translator') {
                obj.id = item.attributes.getNamedItem('id').value
            }

            res[obj.value] = obj;
            res._length++;

            return res;
        }, initialObject);
    }

    return response;

}

function locateAdditionalPlayerLinks(response) {
    var regExp = /<iframe.*? src="(.*?)".*?><\/iframe>/g,
        url = regExp.exec(response.text), result = [];


    while (url) {
        if (url && url[1]) {
            result.push(url[1]);
            url = regExp.exec(response.text);
        }
        else {
            url = null;
        }
    }
    return result;
}

function unicode2win1251(str) {
    var result = "", uniCode, winCode, i;
    if (!str || typeof str !== 'string') return '';
    for (i = 0; i < str.length; i++) {
        uniCode = str.charCodeAt(i);
        if (uniCode == 1105) {
            winCode = 184;
        } else if (uniCode == 1025) {
            winCode = 168;
        } else if (uniCode > 1039 && uniCode < 1104) {
            winCode = uniCode - 848;
        } else {
            winCode = uniCode;
        }
        result += String.fromCharCode(winCode);
    }
    var encoded = "";
    for (i = 0; i < result.length; ++i) {
        var code = Number(result.charCodeAt(i));
        encoded += "%" + code.toString(16).toUpperCase();
    }
    return encoded;
}

function performLoginAttempt(page, showLoginWindow) {
    var credentials = plugin.getAuthCredentials(plugin.getDescriptor().synopsis, "Логин", showLoginWindow),
        response,
        result = {
            result: false,
            response: null
        };
    if (credentials.rejected) { //rejected by user
        result.rejected = true;
        return result;
    }
    if (credentials && credentials.username && credentials.password) {
        response = makeRequest(page, BASE_URL, {
            postdata: {
                'login_name': credentials.username,
                'login_password': credentials.password,
                'login': 'submit'
            },
            noFollow: true
        });
        result = {
            result: !!response.getElementByClassName('login_block').length,
            response: response
        };
    }
    return result;
}
function performLogout(page) {
    makeRequest(page, BASE_URL + '/index.php?action=logout', {
        noFollow: true
    });
    page.redirect(PREFIX + ":start:true");
}


plugin.addURI(PREFIX + ":logout", function (page) {
    performLogout(page);
});


plugin.addURI(PREFIX + ":voice:(.*):(.*)", function (page, title, value) {
    var response, resJson, seasons;

    title = decodeURIComponent(title);
    value = decodeURIComponent(value);
    setPageHeader(page, title);

    //выполним запрос к списку сезонов с этой озвучкой
    response = makeRequest(page, BASE_URL + '/player/ajax.php', {
        method: 'GET',
        args: {
            pl: 'true',
            season: 1,
            episode: 1,
            ts: itemData.voices[value].id,
            translator: value,
            kpid: itemData.kpid,
            url: itemData.url
        }
    }, true);

    resJson = showtime.JSONDecode(response.text);
    //составим список сезонов из пришедших данных
    seasons = html.parse('<select id="season">' + resJson['seasonplaylist'] + '</select>').root;
    seasons = getSeriesData(seasons, 'season');

    //выведем список сезонов на страницу, каждый будет вести на страницу со списом серий
    for (i in seasons) {
        if (seasons.hasOwnProperty(i)) {
            page.appendItem(PREFIX + ':season:' + encodeURIComponent(title + ' / ' + seasons[i].name) + ":" + encodeURIComponent(seasons[i].value) + ":" + encodeURIComponent(value), 'directory', {
                title: seasons[i].name,
                icon: seasons[i].value
            });
        }
    }

});


plugin.addURI(PREFIX + ":season:(.*):(.*):(.*)", function (page, title, seasonId, voiceId) {
    var response, resJson, episodes, i, requestArgs;

    title = decodeURIComponent(title);
    seasonId = decodeURIComponent(seasonId);
    voiceId = decodeURIComponent(voiceId);
    setPageHeader(page, title);

    requestArgs = {
        pl: 'true',
        season: seasonId,
        episode: 1,
        kpid: itemData.kpid,
        url: itemData.url
    };

    if (voiceId !== 'null') {
        requestArgs.ts = itemData.voices[voiceId].id;
        requestArgs.translator = voiceId;
    }

    //выполним запрос к списку сезонов с этой озвучкой
    response = makeRequest(page, BASE_URL + '/player/ajax.php', {
        method: 'GET',
        args: requestArgs
    }, true);

    resJson = showtime.JSONDecode(response.text);
    //составим список эпизодов из пришедших данных
    episodes = html.parse('<select id="episode">' + resJson['episodeplaylist'] + '</select>').root;
    episodes = getSeriesData(episodes, 'episode');

    //выведем список эпизодов на страницу, каждый будет вести на страницу эпизода, где мы найдем ссылку на видео, а оттуда редиректнем на воспроизведение
    for (i in episodes) {
        if (episodes.hasOwnProperty(i)) {
            page.appendItem(PREFIX + ':episode:' + encodeURIComponent(title + ' / ' + episodes[i].name) + ":" + encodeURIComponent(seasonId) + ":" + encodeURIComponent(voiceId) + ":" + encodeURIComponent(episodes[i].value), 'directory', {
                title: episodes[i].name,
                icon: episodes[i].value
            });
        }
    }

});


plugin.addURI(PREFIX + ":episode:(.*):(.*):(.*):(.*)", function (page, title, seasonId, voiceId, episodeId) {
    var response, resJson, episodes, i, requestArgs;

    title = decodeURIComponent(title);
    seasonId = decodeURIComponent(seasonId);
    voiceId = decodeURIComponent(voiceId);
    episodeId = decodeURIComponent(episodeId);
    setPageHeader(page, title);

    requestArgs = {
        pl: 'false',
        season: seasonId,
        episode: episodeId,
        kpid: itemData.kpid,
        url: itemData.url
    };

    if (voiceId !== 'null') {
        requestArgs.ts = itemData.voices[voiceId].id;
        requestArgs.translator = voiceId;
    }

    //выполним запрос к списку сезонов с этой озвучкой
    response = makeRequest(page, BASE_URL + '/player/ajax.php', {
        method: 'GET',
        args: requestArgs
    }, true);

    resJson = showtime.JSONDecode(response.text);
    //найдем ссылку на видео в пришедшем JSON и создадим пункт "Воспроизведение"
    page.appendItem(PREFIX + ':play:' + encodeURIComponent('hls:' + BASE_URL + resJson['html5']) + ":" + title + ":true", 'video', {
        title: decodeURIComponent(title)
    });


});


plugin.addURI(PREFIX + ":start:(.*)", function (page, forceAuth) {
    setPageHeader(page, plugin.getDescriptor().synopsis);
    var loginSuccess = !(forceAuth === 'true'),
        loginResult,
        response,
        sections, section, i, length,
        links, link;
    while (true) {
        loginResult = performLoginAttempt(page, !loginSuccess);
        if (loginResult.rejected) {
            return;
        }
        loginSuccess = loginResult.result;
        response = loginResult.response;
        if (loginSuccess) break;
        loginSuccess = false;
    }

    //добавим возможность логаута
    page.appendItem(PREFIX + ":logout", "directory", {
        title: new showtime.RichText("Выйти из аккаунта")
    });

    //на главной странице находится несколько секций, парсим каждую из них
    sections = response.getElementByClassName('hblock');
    length = sections.length;
    for (i = 0; i < length; i++) {
        section = sections[i];
        links = section.getElementByClassName('block-link');
        if (links.length) {
            links = links[0].getElementByTagName('a');
            if (links.length) {
                //первая же ссылка - это название раздела и путь в него
                //добавим сначала сепаратор
                page.appendItem("", "separator", {
                    title: links[0].textContent
                });
                //а потом сам список

                page.appendItem(PREFIX + ':list:' + encodeURIComponent(links[0].attributes[0].value) + ':' + encodeURIComponent(links[0].textContent), 'directory', {
                    title: 'Все ' + links[0].textContent
                });

                //после списка добавим на страницу все найденные элементы
                findItems(page, section);
            }
        }
    }
});

plugin.addURI(PREFIX + ":list:(.*):(.*)", function (page, url, title) {
    var paginator = function () {
        var dom = makeRequest(page, decodeURIComponent(url)),
            newUrl;
        findItems(page, dom);
        newUrl = findNextPage(dom);
        if (newUrl) {
            url = newUrl;
        }
        return !!newUrl;

    };
    setPageHeader(page, decodeURIComponent(title));
    paginator();
    page.paginator = paginator;
});


plugin.addURI(PREFIX + ":item:(.*):(.*):(.*)", function (page, reqUrl, title, poster) {
    title = decodeURIComponent(title);
    setPageHeader(page, title);
    reqUrl = decodeURIComponent(reqUrl);
    var response = makeRequest(page, reqUrl, null, true),
        mainPlayerLink = locateMainPlayerLink(page, reqUrl, response),
        additionalPlayersLinks = [],
        //additionalPlayersLinks = locateAdditionalPlayerLinks(response),
        i,
        description = getProperty(response.dom, 'post_content');

    //это сериал
    if (mainPlayerLink && typeof mainPlayerLink === 'object') {

        //есть разные озвучки, создадим их список
        if (mainPlayerLink.voices._length) {
            page.appendItem("", "separator", {
                title: "Озвучки"
            });

            for (i in mainPlayerLink.voices) {
                if (mainPlayerLink.voices.hasOwnProperty(i)) {
                    page.appendItem(PREFIX + ':voice:' + encodeURIComponent(title + ' / ' + mainPlayerLink.voices[i].name) + ":" + encodeURIComponent(mainPlayerLink.voices[i].value), 'directory', {
                        title: mainPlayerLink.voices[i].name,
                        icon: mainPlayerLink.voices[i].value,
                        description: description
                    });
                }
            }
        }
        //озвучек нет, значит, есть только сезоны. Создадим список сезонов.
        else {
            page.appendItem("", "separator", {
                title: "Сезоны"
            });

            for (i in mainPlayerLink.seasons) {
                if (mainPlayerLink.seasons.hasOwnProperty(i)) {
                    page.appendItem(PREFIX + ':season:' + encodeURIComponent(title + ' / ' + mainPlayerLink.seasons[i].name) + ":" + encodeURIComponent(mainPlayerLink.seasons[i].value) + ":null", 'directory', {
                        title: mainPlayerLink.seasons[i].name,
                        icon: mainPlayerLink.seasons[i].value,
                        description: description
                    });
                }
            }
        }

    }

    else {
        /*page.appendItem("", "separator", {
            title: "Основной плеер"
        });
        */
        page.appendItem(PREFIX + ':play:' + encodeURIComponent(mainPlayerLink) + ":" + title + ":true", 'video', {
            title: decodeURIComponent(title),
            icon: decodeURIComponent(poster),
            description: description
        });

        if (additionalPlayersLinks.length) {

            //добавим сепаратор, а после него все ссылки на доп. источники видео
            page.appendItem("", "separator", {
                title: "Доп. источники"
            });

            for (i = 0; i < additionalPlayersLinks.length; i++) {
                page.appendItem(PREFIX + ':play:' + encodeURIComponent(additionalPlayersLinks[i]) + ":" + title + ":false", 'video', {
                    title: decodeURIComponent(title),
                    icon: decodeURIComponent(poster),
                    description: description
                });
            }
        }

    }
});


// Play links
plugin.addURI(PREFIX + ":play:(.*):(.*):(.*)", function (page, url, title, directPlay) {
    var link, urlDecoded, titleDecoded;
    page.type = "video";
    page.loading = true;
    urlDecoded = decodeURIComponent(url);
    titleDecoded = decodeURIComponent(title);
    if (directPlay === 'true') {
        link = urlDecoded;
    }
    else {
        link = parseVideoIframe(urlDecoded);
    }

    page.loading = false;
    page.source = "videoparams:" + showtime.JSONEncode({
            title: titleDecoded,
            canonicalUrl: PREFIX + ':play:' + url + ':' + title,
            sources: [{
                url: link
            }]
        });


});


plugin.addSearcher(plugin.getDescriptor().id, logo, function (page, query) {
    var pageNum = 1,
        paginator = function () {

            var dom = makeRequest(page, BASE_URL + '/index.php?do=search', {
                    postdata: {
                        subaction: 'search',
                        do: 'search',
                        full_search: 0,
                        search_start: pageNum,
                        result_from: page.entries + 1,
                        story: unicode2win1251(query)
                    }
                }),
                hasNextPage;
            findItems(page, dom, true);
            hasNextPage = findNextPage(dom, true);
            if (hasNextPage) {
                pageNum++;
            }
            return !!hasNextPage;

        };
    page.entries = 0;
    page.paginator = paginator;
    performLoginAttempt(page);
    paginator();
});