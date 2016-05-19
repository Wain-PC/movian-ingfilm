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
    //описание тайтл
        description = getProperty(response.dom, 'post_content'),
        regExp = /<iframe.*? src="(.*?)".*?><\/iframe>/g, url;
    url = regExp.exec(response.text);
    while (url) {
        if(url && url[1]) {
            page.appendItem(PREFIX + ':play:' + encodeURIComponent(url[1]) + ":" + title, 'video', {
                title: decodeURIComponent(title),
                icon: decodeURIComponent(poster),
                description: description
            });
            url = regExp.exec(response.text);
        }
        else {
            url = null;
        }
    }
});


// Play links
plugin.addURI(PREFIX + ":play:(.*):(.*)", function (page, url, title) {
    var html, link;
    page.type = "video";
    page.loading = true;
    url = decodeURIComponent(url);
    title = decodeURIComponent(title);


});


plugin.addSearcher(plugin.getDescriptor().id, logo, function (page, query) {

});