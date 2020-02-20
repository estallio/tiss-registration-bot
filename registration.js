const fs = require('fs');
const moment = require('moment');
const puppeteer = require('puppeteer');
const lt = require('long-timeout');

(async () => {
    try {
        /**
         * read input
         */
        console.log('read input...');
        const inputFile = process.argv[2];
        const jsonInput = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
        const martrikelNr = jsonInput.login.studentId;
        const password = jsonInput.login.password;
        const registrationInput = jsonInput.registrations;

        /**
         * login
         */
        console.log('launch chrome...');
        const browser = await puppeteer.launch({ headless: true, slowMo: 0, args: ['--no-sandboxs --disable-gpu'] });
        const initPage = await newPageWithNewContext(browser);
        await login(initPage, martrikelNr, password);

        /**
         * get windowhandler.js file first to speed up later refresh
         */
        console.log('get windowhandler.js...');
        let windowHandlerJs = '';
        initPage.on('response', async response => {
            if (![200, 201, 304].includes(response.status())) {
                return;
            }
            try {
                await response.buffer();
                const url = response.url();

                if (url.indexOf('.js.xhtml') !== -1) {
                    response.text()
                        .then(text => {
                            windowHandlerJs += '\n' + text;
                        });
                }
            } catch (e) { }
        });
        await initPage.goto(registrationInput[0].address);
        await initPage.waitFor('form');

        /**
         * register windowhandler.js file
         */
        await initPage.evaluateOnNewDocument(windowHandlerJs);

        /**
         * prevent all kinds of dependencies
         */
        await interceptRequests(initPage);

        /**
         * get register-start dates
         */
        let registrations = [];
        for (let i = 0; i < registrationInput.length; i++) {
            await initPage.goto(registrationInput[i].address);
            await initPage.waitFor('form');

            registrations.push({
                ...registrationInput[i],
                ... await getWrapper(initPage, registrationInput[i].name)
            });
        }

        /**
         * close init-page
         */
        await closePage(browser, initPage);

        /**
         * sort
         */
        registrations.sort((a, b)=> a.begin - b.begin);

        let error = 0;
        let finished = 0;

        /**
         * start timeouts
         */
        for (let i = 0; i < registrations.length; i++) {

            /**
             * check if registration is over
             */
            if (registrations[i].end) {
                let millisTillEnd = moment(registrations[i].end, 'DD.MM.YYYY, HH:mm').valueOf();
                if (millisTillEnd < moment().valueOf()) {
                    console.log('registration over: ' + registrations[i].name);
                    error++;
                    continue;
                }
            }

            /**
             * calculate milliseconds till registration starts
             */
            let millisTillBegin = moment(registrations[i].begin, 'DD.MM.YYYY, HH:mm').valueOf();
            millisTillBegin = millisTillBegin - moment().valueOf();

            /**
             * login 30 seconds before registration starts
             */
            lt.setTimeout(async () => {
                const page = await newPageWithNewContext(browser);

                page.error = () => {
                    error++;
                }

                page.finished = () => {
                    finished++;
                }

                try {
                    /**
                     * login
                     */
                    await login(page, martrikelNr, password);

                    /**
                     * prevent all kinds of dependencies
                     */
                    await interceptRequests(page);

                    /**
                     * register windowhandler.js file
                     */
                    await page.evaluateOnNewDocument(windowHandlerJs);

                    /**
                     * load register page
                     */
                    await page.goto(registrations[i].address);
                    await page.waitFor('form');

                    /**
                     * refresh millis
                     */
                    millisTillBegin = moment(registrations[i].begin, 'DD.MM.YYYY, HH:mm').valueOf();
                    millisTillBegin = millisTillBegin - moment().valueOf();

                    /**
                     * register
                     */
                    lt.setTimeout(async () => {
                        try {
                            await register(page, registrations[i].name);
                            await closePage(browser, page);
                            page.finished();
                        } catch(ex) {
                            await closePage(browser, page);
                            page.error();
                        }
                    }, millisTillBegin);
                } catch(ex) {
                    await closePage(browser, page);
                    page.error();
                }
            }, Math.max(millisTillBegin - 30000, 0));
        }

        let update = setInterval(async () => {
            console.log('pending: ' + (registrations.length - error - finished) + ', finished: ' + finished + ', error: ' + error);

            if (error + finished === registrations.length) {
                console.log('finished registration...');
                await browser.close();
                clearInterval(update);
            }
        }, 10000);
    } catch(ex) {
        console.log(ex);
        process.exit();
    }
})();

/**
 * for speed enhancements this function
 * intercepts all requests to depended, not
 * needed files and prevents the download
 */
async function interceptRequests(page) {
    console.log('intercept requests...');
    page.on('request', interceptedRequest => {
        const url = interceptedRequest.url();
        if (url.indexOf('.png') !== -1
        || url.indexOf('.jpg') !== -1
        || url.indexOf('.css') !== -1
        || url.indexOf('.ico') !== -1
        || url.indexOf('.js') !== -1
        || url.indexOf('.gif') !== -1) {
            interceptedRequest.abort();
        } else {
            interceptedRequest.continue();
        }
    });
    await page.setRequestInterception(true);
}

/**
 * performs a zid login for a page to get the cookies
 */
async function login(page, martrikelNr, password) {
    console.log('login...');
    await page.goto('https://iu.zid.tuwien.ac.at/AuthServ.portal');
    await page.waitFor('form');
    await page.$eval('input[name="name"]', (element, martrikelNr) => element.value = martrikelNr, martrikelNr);
    await page.$eval('input[name="pw"]', (element, password) => element.value = password, password);
    await page.click('input[type="submit"]');
    await page.waitFor('#main-content');
}

/**
 * creates a new context in the browser and
 * returns a new page created within the new context
 * (needed because of different asyncronous/simulatnious
 * logins/cookies)
 */
async function newPageWithNewContext(browser) {
    console.log('create new page...');
    const context = await browser.createIncognitoBrowserContext();
    const page = await context.newPage();
    return page;
}

/**
 * closes a browser page
 */
async function closePage(browser, page) {
    console.log('close page...');
    await page.close();
}

/**
 * refreshes the page, searches for the right
 * course and sends register requests
 */
async function register(page, name) {
    console.log('register ' + name + '...');

    let time = Date.now();

    await page.reload();
    await page.waitFor('.groupWrapper');

    let wrapper = await getWrapper(page, name);

    await page.waitFor('input[name="' + wrapper.selectorName + '"]');
    await page.click('input[name="' + wrapper.selectorName + '"]');
    await page.waitFor('input[value="Anmelden"]');
    await page.click('input[value="Anmelden"]');
    await page.waitFor('#wrapper');

    let text = await page.evaluate(() => {
        var message = document.querySelector('.staticInfoMessage');

        if (message) {
            return message.textContent;
        }
        return 'error reading response';
    });

    console.log('response: ' + text.trim());
    console.log('registration request-process of ' + name + ' took ' + (Date.now() - time) + 'ms');
}

/**
 * searches the right item wrapper and extracts relevant information
 */
async function getWrapper(page, name) {
    console.log('get informations...');

    page.on('console', msg => console.log(msg.text()));

    return await page.evaluate(name => {
        var groupWrappers = document.querySelectorAll('.groupWrapper');

        for (var i = 0; i < groupWrappers.length; i++) {
            var childs = groupWrappers[i].querySelector('.groupHeaderWrapper .header_element.titleCol').childNodes;
            var main = '';
            var text = '';

            for (var a = 0; a < childs.length; a++) {
                if (childs[a].nodeType == 1) {
                    main = childs[a].textContent.trim();
                } else if (childs[a].nodeType == 3) {
                    text = childs[a].textContent.trim();
                }
            }

            var parsedName = main + (text ? ' ' + text : '');

            /**
             * always be careful with whitespaces
             */
            var referenceName = name.trim();
            parsedName = parsedName.replace(/  +/g, ' ').trim();

            // console.log('got:\t\t' + parsedName + '\nreference: \t' + name);

            var selectorName = groupWrappers[i].querySelector('input[value="Anmelden"]');

            if (!selectorName) {
                selectorName = groupWrappers[i].querySelector('input[value="Voranmeldung"]');
            }

            selectorName = selectorName !== null ? selectorName.name : '';

            if (name === parsedName) {

                var end = groupWrappers[i].querySelector('span[id*="end" i]');
                if (end) {
                    end = end.textContent.trim();
                }

                return {
                    main: main,
                    text: text,
                    begin: groupWrappers[i].querySelector('span[id*="begin" i]').textContent.trim(),
                    end: end,
                    selectorName: selectorName
                };
            }
        }
    }, name);
}
