---
title: Bluesky integration
id: bluesky
fields:
    - {
          id: "handle",
          placeholder: "user handle",
          helpText: "e.g. bimbo.bsky.social",
          addon: "@",
      }
    - {
          id: "appPassword",
          placeholder: "app password",
          type: "password",
          helpText: '<span style="color: red">do NOT enter your real password!</span> <a href="https://bsky.app/settings/app-passwords">click here</a> to generate an app password (make sure you''re on the right account!)',
      }
---

<div class="block">
    with this integration enabled, bimbo will automatically post to your Bluesky account with a link to new blog posts (or any page) after deployment
</div>
<div class="block">
    to flag a page to be posted to Bluesky, add the following to the front matter section of the .md file: <code>bskyPostId: tbd</code>
</div>
<div class="block">
    after a successful deployment, the "tbd" will be replaced with the Bluesky post's ID. if you would like to show replies to the Bluesky post as "comments" at the bottom of the page, add <code>comments: true</code>
</div>
