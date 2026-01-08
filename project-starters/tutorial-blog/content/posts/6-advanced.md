---
title: the advanced
date: 2026-01-06
draft: false
---

by now you've hopefully have a rough idea of how a bimbo project works and how to work with it. this post goes a bit more into the weeds of working with [Handlebars](https://handlebarsjs.com/)

# templating deep dive

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

these double bracket placeholders that appear all over the template files are Handlebars expressions. a simple example here is the `{{title}}` expression, which gets replaced on build with the `title` value defined in `archive.md`.

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

the end result is a bulleted list of dates and titles, which link to the actual posts themselves. there's a bit of bimbo specific[^2] junk[^3] happening here that isn't super important, but hopefully it mostly makes sense!

i'd recommend checking out the [Handlebars documentation](https://handlebarsjs.com/guide/#simple-expressions) to learn more about this syntax and what kinds of things you can do with it

# working with `/data`

in addition to all the folders we covered in an earlier post, you can also create a `/data` folder to load in a handful of non-Markdown formats such as '.json' and '.yaml'. these can be accessed in templates via the special `site.userDefined` variable.

for a simple example, let's imagine we have a `/data/colors.txt` file that contains the following:

```
Red
Green
Blue
```

this list will automatically be split into an array that can then be iterated over:

```
<ul>
    {{#each site.userDefined.colors}}
        <li>{{this}}</li>
    {{/each}}
</ul>
```

which will be compiled into the following:

```
<ul>
    <li>Red/li>
    <li>Green/li>
    <li>Blue/li>
</ul>
```


[^1]: [W3Schools](https://www.w3schools.com/html/) has been my go-to for years, but i'm open to suggestions for better resources to point folks toward!
[^2]: `site.blogPosts` is kind of a "magic" variable in that it's not something you define anywhere - it's created dynamically during the build process. i don't love this and would like to find a better way of handling things like this that isn't so opaque or at least document it better
[^3]: `formatDate` is a custom function inside bimbo that does exactly what it says. you can adjust the actual formatting by editing the `site.dateFormat` value in `bimbo.yaml`