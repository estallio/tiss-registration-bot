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
         * get windowhandler.js file first to speed up later page-loads (kind of caching)
         */
        console.log('get windowhandler.js...');
        let windowHandlerJs = '';
        initPage.on('response', async response => {
            // block requests for missing files - no caching available for them
            if (![200, 201, 304].includes(response.status())) {
                return;
            }

            try {
                await response.buffer();
                const url = response.url();

                // gather the content of these 2 js files for later offline injection
                if (url.indexOf('windowhandler.js.xhtml') !== -1 || url.indexOf('windowIdHandling.js.xhtml') !== -1) {
                    response.text()
                        .then(text => {
                            windowHandlerJs += ' ' + text;
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
         * prevent all types of dependencies like images, css from being loaded -> better performance, lower latencies
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
        registrations.sort((a, b) => a.begin - b.begin);

        /**
         * status update interval
         */
        let updateInterval = null;

        /**
         * function called every 10s and on state updates
         */
        const finishedCheck = async () => {
            console.log('pending: ' + (registrations.length - error - finished) + ', finished: ' + finished + ', error: ' + error);

            if (error + finished === registrations.length) {
                console.log('finished registration...');
                await browser.close();

                // clear interval if set
                if (updateInterval) {
                    clearInterval(updateInterval);
                }
            }
        };

        /**
         * start status updates
         */
        updateInterval = setInterval(finishedCheck, 10000);

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
                    finishedCheck();
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
                let retryNecessary = true;

                while (retryNecessary) {
                    const page = await newPageWithNewContext(browser);

                    page.error = () => {}

                    page.finished = () => {
                        finished++;
                        finishedCheck();
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

                        await new Promise((resolve, reject) => {
                            /**
                             * register
                             */
                            lt.setTimeout(async () => {
                                try {
                                    await register(page, registrations[i].name);
                                    await closePage(browser, page);
                                    retryNecessary = false;
                                    page.finished();
                                    resolve();
                                } catch(ex) {
                                    retryNecessary = true;
                                    page.error();
                                    reject();
                                }
                            }, millisTillBegin);
                        });
                    } catch(ex) {
                        await closePage(browser, page);
                        page.error();
                        retryNecessary = true;
                        console.log(ex);
                        console.log('something went wrong, maybe the connection could not be established...');
                        console.log('retrying in 10 seconds...');
                        await sleep(10000);
                    }
                }
            }, Math.max(millisTillBegin - 30000, 0));
        }
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
            interceptedRequest.respond({
                status: 200,
                body: "",
              });
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
    await page.waitFor('form[name="f"]');
    await page.$eval('input[name="username"]', (element, martrikelNr) => element.value = martrikelNr, martrikelNr);
    await page.$eval('input[name="password"]', (element, password) => element.value = password, password);
    await page.click('button[type="submit"]');
    await page.waitFor('#wpPageWrapper');
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

    let attempt = 1;

    let time = Date.now();

    while (attempt > 0) {
        try {
            console.log('attempt: ' + attempt + '...');

            console.log('reload page...');

            await page.reload();
            await page.waitFor('.groupWrapper');

            let wrapper = await getWrapper(page, name);

            console.log('search for registration button...');

            await page.waitFor('input[name="' + wrapper.selectorName + '"]', { timeout: 100 });
            await page.click('input[name="' + wrapper.selectorName + '"]');
            await page.waitFor('input[value="Anmelden"]');
            await page.click('input[value="Anmelden"]');
            await page.waitFor('#wrapper');

            console.log('registration succeeded on ' + attempt + '. attempt...');
            attempt = 0;
        } catch (ex) {
            console.log('can not find registration button...');
            const sleepTime = 500 * Math.ceil(attempt / 10);
            console.log('try again in ' + sleepTime + 'ms...');
            await sleep(500 * (attempt / 5));   // every 5. attempt, the time between a retry is increased by 500ms
            attempt++;

            if (attempt > 30) {
                console.log('could not find button after 30 attempts...');
                console.log('retrying a new login now...');
                throw new Error();
            }
        }
    }

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

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
