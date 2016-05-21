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
    service = plugin.createService(plugin.getDescriptor().id, PREFIX + ":start", "video", true, logo),
    html = require('showtime/html'),
    io = require('native/io');

io.httpInspectorCreate('http://ingfilm.ru.*', function (req) {
    req.setCookie('beget', 'begetok;');
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
    if (!url) {
        return showtime.message('NO_URL_IN_REQUEST');
    }
    if (!page) {
        return showtime.message('NO_PAGE_OBJECT_IN_REQUEST');
    }
    if (!settings) {
        settings = {
            method: 'GET',
            noFollow: true
        };
    }

    if (url.indexOf(BASE_URL) !== 0) {
        url = BASE_URL + url;
    }
    page.loading = true;

    var v = showtime.httpReq(url, settings);
    page.loading = false;
    if (!returnUnparsed) {
        return html.parse(v.toString()).root;
    }
    return {
        dom: html.parse(v.toString()).root,
        text: v.toString()
    }
}


function findItems(page, dom) {
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

function findNextPage(dom) {
    var next = dom.getElementByClassName('next');
    if (next.length) {
        next = next[0];
        next = next.children[0].attributes[0].value;
        return next;
    }
    return false;
}

function metaTag(res, tag) {
    var dom = html.parse(res);
    var meta = dom.root.getElementByTagName('meta'),
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
    switch (urlPart = url.substr(0, 9)) {
        case 'http://mo':
        case /http:\/\/\d{2}/.test(urlPart):
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

function locateMainPlayerLink(page, response) {
    //описание тайтл
       var regExp = /<iframe.*? src="(.*?)".*?><\/iframe>/g, url,
        scriptRegExp = /src="http:\/\/ingfilm\.ru\/player\/api\.php(.*?)">/, scriptUrl, scriptResponse,
        iframeRegExp = /ifrm\.setAttribute\("src", "\/\/(.*?)"/, iframeUrl, iframeResponse,
        playLinkRegExp = /src=\/video\/" \+ token \+ "(.*?) controls/,
        token, playLink;
    url = regExp.exec(response.text);

    //Step 1. Locate script and load it
    scriptUrl = scriptRegExp.exec(response.text);
    if (scriptUrl && scriptUrl[1]) {
        scriptUrl = BASE_URL + '/player/api.php' + scriptUrl[1];
        scriptResponse = makeRequest(page, scriptUrl, null, true).text;


        //Step 2. Find IFRAME URL in the script
        iframeUrl = iframeRegExp.exec(scriptResponse);
        if (iframeUrl && iframeUrl[1]) {
            iframeUrl = iframeUrl[1];

            //Step 3. Load Iframe content from URL
            iframeResponse = makeRequest(page, 'http://' + iframeUrl, null, true);

            //Step 4. Locate video token and create URL
            token = iframeResponse.dom.getElementById('apiplayer').attributes.getNamedItem('token').value;

            playLink = playLinkRegExp.exec(iframeResponse.text);
            if (playLink && playLink[1]) {
                playLink = BASE_URL + '/video/' + token + playLink[1];
                playLink = 'hls:' + playLink;
                return playLink;
            }
        }
    }
    return null;
}

function locateAdditionalPlayerLinks(page, response) {
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


plugin.addURI(PREFIX + ":start", function (page) {
    setPageHeader(page, plugin.getDescriptor().synopsis);
    var loginSuccess = true,
        dom,
        sections, section, i, length,
        links, link;
    while (1) {
        var credentials = plugin.getAuthCredentials(plugin.getDescriptor().synopsis, "Логин", !loginSuccess);
        showtime.print(credentials);
        if (credentials.rejected) return; //rejected by user
        if (credentials) {
            dom = makeRequest(page, BASE_URL, {
                postdata: {
                    'login_name': credentials.username,
                    'login_password': credentials.password,
                    'login': 'submit'
                },
                noFollow: true
            });
            loginSuccess = !!dom.getElementByClassName('login_block').length;
            if (loginSuccess) break;
        }
        loginSuccess = false;
    }

    //на главной странице находится несколько секций, парсим каждую из них
    sections = dom.getElementByClassName('hblock');
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
    setPageHeader(page, decodeURIComponent(title));
    var response = makeRequest(page, decodeURIComponent(reqUrl), null, true),
        mainPlayerLink =  locateMainPlayerLink(page, response),
        additionalPlayersLinks = locateAdditionalPlayerLinks(page, response), i,
        description = getProperty(response.dom, 'post_content');

    if(mainPlayerLink) {
        page.appendItem("", "separator", {
            title: "Основной плеер"
        });
        page.appendItem(PREFIX + ':play:' + encodeURIComponent(mainPlayerLink) + ":" + title + ":true", 'video', {
            title: decodeURIComponent(title),
            icon: decodeURIComponent(poster),
            description: description
        });
    }

    if(additionalPlayersLinks.length) {

        //добавим сепаратор, а после него все ссылки на доп. источники видео
        page.appendItem("", "separator", {
            title: "Доп. источники"
        });

        for(i=0;i<additionalPlayersLinks.length;i++) {
            page.appendItem(PREFIX + ':play:' + encodeURIComponent(additionalPlayersLinks) + ":" + title + ":true", 'video', {
                title: decodeURIComponent(title),
                icon: decodeURIComponent(poster),
                description: description
            });
        }
    }
});


// Play links
plugin.addURI(PREFIX + ":play:(.*):(.*):(.*)", function (page, url, title, directPlay) {
    var html, link, urlDecoded, titleDecoded;
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

});