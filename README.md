# Tiss Registration Bot
This bot should help people like you and me who typically forget registering to courses on time and don't get a place.

## Requirements
To use the bot only node and npm are needed. If you do not have already installed it, you can simply get the most recent version of both from here: https://nodejs.org.

## Usage
Before starting the bot you have to edit the configuration file named `register.json`. In this file simply put your `studenId` and your `password` in the first section, which are actually your tiss credentials. In the array of registrations add a registration as follows:

- `address`: the link from the tiss registration site, for this part it doesn't matter if it's an exam, exercise or course registration - just be sure to open the right tab before copying the link from the browser<br>
- `name`: the whole name of the course as simple text (including date if it's in the name, don't use any special formatting - just copy it or write it per hand with exactly 1x whitespace between, see the picture below)

<br>

![selector](https://github.com/L-E-O-N-H-A-R-D/TissRegistrationBot/blob/master/img/selector.png?raw=true)

<br>

When the configuration was updated start a terminal and navigate to the folder. Arrived in the folder, start:

<br>

`npm install`

and afterwards:

`node registration.js register.json`

<br>

Here, `register.json` is a console-parameter and represents the .json formatted file. The structure as expected like in the sample file. After starting the bot you should see some console output what the bot is actually doing. When the bot has to wait for a registration to begin, every 30 seconds a status message will pe printed to the console. Status updates are printed every 10 seconds. Be sure the bot has internet connection when starting for the first time because some caches are created. After caching, all the files for a faster start up are available and the bot waits for the registration to start. In case of an error like connection issues or a missing registration button, the bot waits some time (depending on the attempt) and retries until stopped.

**Do not forget to delete the sample itmes in register.json before you start the bot!**

Keep in mind a few things when using the bot:
 - If TISS is busy, the bot may not register you correctly. One possible case: bot sends request exactly at start date of the registration, the request is somehow "too fast" and TISS answers with the page from before registration was unlocked - in this case, the bot can not find the registration button on the page and it won't try it again. One possible way to handle this is add some timeout after the begin date of a few hundred milliseconds (may be slow and the error from before still can occur) or implement an additional reload if the register button is not available (better solution). However, this case only occurred once.
 - The bot does not have a reconnect function for the caching process and chrome can always throw some errors.
 - If an error occurs (eg credentials are wrong), the bot cancels a single registration or terminates as a whole.
 - Insert only german course names as the default language from tiss is german.
 - Look at the specific registration details: only default registrations over tiss with a begin-date are possible.
 - Always look at the tiss favourites if you are registered to some courses or not.
 
 If something went wrong or you realized an error please open an issue or send me an email.
