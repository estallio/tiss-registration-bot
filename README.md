# TissRegistrationBot
This bot should help people like you and me who typically forget registering to courses on time and don't get a place.

## Requirements
To use the bot only node and npm are needed. If you do not have already installed it, you can simply get the most recent version of both from here: https://nodejs.org.

## Usage
Before starting the bot you have to edit the configuration file named `register.json`. In this file simply put your `studenId` and your `password` in the first section. In the array of registrations add a registration as follows:

-`address`: the link from the tiss registration site<br>
-`name`: the whole name of the course (including date if it's in the name, see the picture)

<br>

![selector](https://github.com/L-E-O-N-H-A-R-D/TissRegistrationBot/blob/master/img/selector.png?raw=true)

<br>

When the configuration was updated start a terminal and navigate to the folder with the `cd` command. Then, arrived in the folder, start:

`npm install`

and

`node registration.js register.json`

Here, `register.json` is a console-parameter and represents the .json formatted file. The structure as expected like in the sample file.

**Do not forget to delete the sample itmes before you start the bot!**

Keep on mind a few things when using the bot:
 - The bot does not have a reconnect function.
 - If an error occurs, the bot cancels a single registration or terminates as a whole.
 - Insert only german course names as the default language from this is german.
 - Always look at the Tiss favourites if you are registered to some courses or not.
