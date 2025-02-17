---
title: beyond the blog
date: 2025-02-06
draft: false
---

the default structure of a Bimbo project is designed to support blogging, as that's a pretty common use case. however, it's far from the only thing Bimbo is capable of!

you could easily modify the existing templates to create new ones entirely to suit your needs. this will likely require a bit of HTML knowledge, which is out of scope for me to teach here.[^1] i do think it's worth touching briefly on [Handlebars](https://handlebarsjs.com/), tho!

let's look at `/templates/archive.html`:

```
<!DOCTYPE html>
<html>
{{> head}}

<body>
    <div id="container">
        {{> navbar}}
        <div id="content">
            <h1>{{title}}</h1>
            {{{content}}}
            {{> post-list}}
        </div>
        {{> footer}}
    </div>
</body>

</html>
```

these double bracket placeholders that appear all over the template files are Handlebars expressions. if you read the previous post, you should be somewhat familiar with how they work. a simple example here is the `{{title}}` expression, which gets replaced on build with the `title` value defined in `archive.md`.

by default, Handlebars will "escape" values returned by an expression. if you don't want this, you can add a third set of brackets to return the "raw" value instead (as is the case with the `{{{content}}}` expression, which is the Markdown body of `archive.md` converted into HTML)

the last thing i'd like to point out in this template is the use of `>` - this is where the `.hbs` files in `/templates/partials` come in. instead of piping data in, these expressions will be expanded into HTML "partials". let's look more closely at `/templates/partials/post-list.hbs`, which will replace `{{> post-list}}`:

```
<div id="postlistdiv">
    <ul>
        {{#each site.blogPosts}}
            <li><a href="{{this.url}}">{{formatDate this.date}} » {{this.title}}</a></li>
        {{/each}}
    </ul>
</div>
```

here we have some more unique Handlebars syntax. let's talk about `#each` first, which accepts an array (in this case, `site.blogPosts`) as an parameter. the HTML inside the `#each` block will be rendered once per item in this array, which we can access using the `this` variable.

the end result is a bulleted list of dates and titles, which link to the actual posts themselves. there's a bit of Bimbo specific[^2] junk[^3] happening here that isn't super important, but hopefully it mostly makes sense!

i'd recommend checking out the [Handlebars documentation](https://handlebarsjs.com/guide/#simple-expressions) to learn more about this syntax and what kinds of things you can do with it

# that's all!

congrats! you made it to the end of the Bimbo tutorials. i hope it wasn't too complicated, but if it was, please feel free to [shoot me an email](mailto:bimbo@iznaut.com) or DM me on Bluesky and give me feedback!

if you're the technical sort, you can also submit pull requests to the Bimbo repo on GitHub.

have fun making a website!

[^1]: [W3Schools](https://www.w3schools.com/html/) has been my go-to for years, but i'm open to suggestions for better resources to point folks toward!
[^2]: `site.blogPosts` is kind of a "magic" variable in that it's not something you define anywhere - it's created dynamically during the build process. i don't love this and would like to find a better way of handling things like this that isn't so opaque or at least document it better
[^3]: `formatDate` is a custom function inside Bimbo that does exactly what it says. you can adjust the actual formatting by editing the `site.dateFormat` value in `bimbo.yaml`