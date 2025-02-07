# Bimbo SSG
![example bimbo blog](example.png)
[example site here](https://bimbo.nekoweb.org)

i wanted a blog. so i tried some Static Site Generator tools and they all seemed more complicated than i needed

i liked the vibe of Zonelets, but missed some of the nice stuff you get with an SSG

what's a girl to do when she's too smart for the simple tool but too dumb for the advanced tools? she makes her own dumb tool

# setup

i made and tested this with Node.js v23.3.0. i would recommend installing that version for minimal headache

1. clone this repo (or just download a zip if you can't be bothered with all this Git bs)
2. open a command line/terminal thing in the bimbo directory
3. enter `npm install`

# usage

`npm run build` will generate your site and save the result in `/public`

`npm run watch` will start a local webserver that rebuilds your site everytime you make a change

# disclaimer

this thing probably sucks in a bunch of ways. it's probably less performant or whatever than other things you could use. i do not care. i made this to cater to my needs and if it resonates with other ppl, that's just a nice bonus.

i do intend to add more documentation at some point, but a Project Goal is to keep that stuff very light. i want it to be reasonable for someone to pick up Bimbo quickly and easily retain most of that knowledge so you don't need to watch a video tutorial if you haven't updated your site in a year

# contributing

if you're smart and think you can improve Bimbo by adding a cool new feature or streamlining workflows within it, i'm open to pull requests. just make sure you're prepared to educate me on what you did so i can continue understanding how this all fits together

# credits

Bimbo's default look and feel was directly ripped from [Marina Ayano Kittaka](https://bsky.app/profile/even-kei.bsky.social)'s [Zonelets](https://zonelets.net/). you could likely drop in any Zonelets themes with Bimbo and they should Just Work.

shoutouts also to [Kate Bagenzo](https://katebagenzo.neocities.org/)'s [Strawberry Starter](https://strawberrystarter.neocities.org/) which might be considered a different approach to the same problem that Bimbo is trying to solve (but probably a smarter one, since it uses an established SSG as a base)