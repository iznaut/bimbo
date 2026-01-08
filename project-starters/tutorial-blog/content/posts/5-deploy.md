---
title: hosting your website
date: 2026-01-05
draft: false
---

once you're happy with the local preview of your website, it's time to upload the contents of `/_site` to the internet for the world to see.

this process varies slightly depending on which hosting service you use, so i won't go into great detail here. i will say that [Neocities](https://neocities.org/) seems to be the one i hear about most commonly. personally, i've been trying out [Nekoweb](https://nekoweb.org/), and liking it so far.

# one-click deploy

if you use either Neocities or Nekoweb and pay a minimum of $5 for bimbo, you can access bimbo+[^1] which has a "one-click deploy" feature. it requires a bit of one-time setup per project:

create a file named `bimbo-secrets.yaml`[^2] in the root of your project with the following contents:

```
deployment:
  provider: nekoweb   # or neocities
  apiKey: [YOUR_API_KEY_HERE]
```

for Nekoweb, you can generate an API key here: [https://nekoweb.org/api](https://nekoweb.org/api)

for Neocities, it's slightly more complicated, but you can learn more about that here: [https://neocities.org/api](https://neocities.org/api)

after adding this configuration, you should now see an option to deploy to your provider.

## beta note

at time of writing, the Nekoweb deploy option isn't fully implemented, but Neocities should work (if you can manage to generate your API token - i'll streamline this in a future update)

[^1]: feels rude to paywall like this, but i've also sunk a lot of hours into this project at this point and it would be nice to get some small return on the investment. i figure if you're doing enough work with bimbo that manual uploading becomes an inconvenience, you probably like the tool enough to make a one-time contribution
[^2]: technically, you could put this stuff in `bimbo.yaml` as well, but `bimbo-secrets.yaml` is ideal for sensitive configuration that you don't want to include in version control[^3] (like API keys)
[^3]: version control is another can of worms entirely. i DO recommend it for your projects and should note that new projects will automatically include a `.gitignore` file that keeps `/_site` and `bimbo-secrets.yaml` from being included in git commits