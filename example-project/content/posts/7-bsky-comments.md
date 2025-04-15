---
title: comments with Bluesky
date: 2025-02-07
draft: false
comments: true
bskyPostId: 3lmuxetostg2h
---

when you have a blog, it's nice for your readers to have a space where they can share their thoughts[^1] and connect with you. there are various options available for allowing this ([Disqus](https://disqus.com/) being the one i hear about the most), but we like to keep it sleezy here at Bimbo so i'm taking a different tact

# Bluesky

if you found this place, you _probably_ know what Bluesky is bc i have been posting about Bimbo on there. if you don't, it's a social media site like Twitter[^2] but with some futuristic tech stuff going on in the background that i don't really care to explain, BUT the important part for our purposes is that you can pretty easily use their API[^3] to grab data and do cool stuff with it on your website

thanks to [this post from Jonathan Moallem of Caps Collective](https://capscollective.com/blog/bluesky-blog-comments/), it was trivially easy to just kind of drop-in support for "comments" via Bluesky posts. the idea is that you can make a post on Bluesky linking to your blog post and any replies to that will be displayed on the actual webpage of your blog post.

the advantage of this approach is that it captures a lot of the conversation folks are already having in response to your Bluesky post (rather than splintering it with a bespoke commenting platform), it allows you to leverage Bluesky's moderation tools (blocking users on Bluesky will also hide their posts on your blog), and maybe most importantly (to me, anyway) - it doesn't require someone to sign up for another service (assuming they're already on Bluesky, obviously)

# adding comments with Bimbo

since this is something i'm personally interested in leveraging for my blog, i decided to make it a Proper Feature in Bimbo rather than just hacking it in[^3]. i think it's about as straightforward as it can be (without a lot of extra work on my end, anyway), but as always, please let me know[^4] if you have suggestions on how to improve this functionality

also - i suppose it's worth saying that i assume you're using the latest version of Bimbo and a fresh project (initialized from the latest `example.zip`) for this to work.

first off, you'll want to open `bimbo.yaml` and edit the value under `site.integrations.bskyUserId`:

```
  ...
  sortPostsAscending: true
  codeTheme: tokyo-night-dark
  integrations:
    bskyUserId: sofkq7uzgyczeyl24wxuc47o
```

the existing user ID is for an account i made just for this demo site, which is [@bimbo.nekoweb.org](https://bsky.app/profile/bimbo.nekoweb.org)[^5]. the other important bit of config will be on the blog post itself, as we can see here on `7-bsky-comments.md`:

```
---
title: comments with Bluesky
date: 2025-02-07
draft: false
bskyPostId: 3lincp4ikhe2c
---
```

so now you know my Bluesky user ID and the ID of the specific post that we want to display comments from. but how do you get these for _your_ blog?

it's not pretty, but you'll want to open the elipsis (...) menu on the Bluesky post in question and click "Embed post". here's what i get when i copy this code:

```
<blockquote class="bluesky-embed" data-bluesky-uri="at://did:plc:sofkq7uzgyczeyl24wxuc47o/app.bsky.feed.post/3lincp4ikhe2c" data-bluesky-cid="bafyreibm7nkc6sa5xs47du7x4ogdxiyqkbwykh62s6s4o32v6wkdddowcq"><p lang="en">this is a post to test comments on Bimbo blog!</p>&mdash; bimbo.nekoweb.org (<a href="https://bsky.app/profile/did:plc:sofkq7uzgyczeyl24wxuc47o?ref_src=embed">@bimbo.nekoweb.org</a>) <a href="https://bsky.app/profile/did:plc:sofkq7uzgyczeyl24wxuc47o/post/3lincp4ikhe2c?ref_src=embed">February 20, 2025 at 4:12 PM</a></blockquote><script async src="https://embed.bsky.app/static/embed.js" charset="utf-8"></script>
```

see the `data-bluesky-url` value? let's look at that more closely:

```
data-bluesky-uri="at://did:plc:sofkq7uzgyczeyl24wxuc47o/app.bsky.feed.post/3lincp4ikhe2c"
```

it's still ugly, but you can hopefully see now where these IDs are coming from: the user is just after the `at://did:plc:` bit and the post is after that final slash. these are the values you'll want to copy out and place in their respective locations[^6]

# that's it?

that's it! your post should now have some indication of being connected to Bluesky at the bottom. i should also note - if you don't include a `bskyPostId` on a post, it simply won't show any of this junk. so it's totally opt-in.

## bonus feature: icons

this is not _really_ relevant to all this comments stuff but you may also notice that there are icons alongside your reply/repost/like counts - the latest Bimbo has a new Handlebars helper function that allows you to quickly add icons in your templates via [Feather](https://feathericons.com/)

if you want to icons elsewhere on your site, i recommend checking out `templates/partials/bsky-comments.hbs` to see how i'm implementing them. have fun!

[^1]: i mean, in theory. let's be optimistic about the things ppl might have to say on the internet, just for the sake of this post
[^2]: i am not optimistic that you would want to hear the things ppl might have to say on Twitter at this point, tbh
[^3]: tbf about 90% of this project is me just "hacking it in". i guess the real difference is that i'm writing a tutorial for how to use it?
[^4]: via the comments at the bottom of this page, perhaps?
[^5]: you don't have to make a new account just for this purpose, but it is kinda cool to have a user handle that points at your blog's domain
[^6]: the user ID will be referenced globally from `bimbo.yaml`, so this should be the only time you have to set it. the post ID will likely be unique per blog post, though