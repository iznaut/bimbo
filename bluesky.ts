// source: https://kulpinski.dev/posts/embed-card-links-on-bluesky/

import { AtpAgent, RichText } from "@atproto/api"

type Metadata = {
  title: string
  description: string
  image: string
}

/**
 * Get the URL metadata
 * @param url - The URL to get the metadata for
 * @returns The metadata
 */
const getUrlMetadata = async (url: string) => {
  const req = await fetch(`https://api.dub.co/metatags?url=${url}`)
  const metadata: Metadata = await req.json()

  return metadata
}

/**
 * Get the Bluesky embed card
 * @param url - The URL to get the embed card for
 * @param agent - The Bluesky agent
 * @returns The embed card
 */
const getBlueskyEmbedCard = async (url: string | undefined, agent: AtpAgent) => {
  if (!url) return

  try {
    const metadata = await getUrlMetadata(url)
    const blob = await fetch(metadata.image).then(r => r.blob())
    const { data } = await agent.uploadBlob(blob, { encoding: "image/jpeg" })

    return {
      $type: "app.bsky.embed.external",
      external: {
        uri: url,
        title: metadata.title,
        description: metadata.description,
        thumb: data.blob,
      },
    }
  } catch (error) {
    console.error("Error fetching embed card:", error)
    return
  }
}

const createBlueskyEmbedCard = async (url: string, title: string, description: string, thumb: Blob, agent: AtpAgent) => {
  const { data } = await agent.uploadBlob(thumb, { encoding: "image/jpeg" })

  return {
      $type: "app.bsky.embed.external",
      external: {
        uri: url,
        title: title,
        description: description,
        thumb: data.blob,
      },
    }
}

/**
 * Get the Bluesky agent
 * @returns The Bluesky agent
 */
const getBlueskyAgent = async () => {
  const agent = new AtpAgent({
    service: "https://bsky.social",
  })

  await agent.login({
    identifier: process.env.BLUESKY_USERNAME!,
    password: process.env.BLUESKY_PASSWORD!,
  })

  return agent
}

/**
 * Send a post to Bluesky
 * @param text - The text of the post
 * @param url - The URL to include in the post
 */
export const sendBlueskyPost = async (text: string, url?: string) => {
  const agent = await getBlueskyAgent()
  const rt = new RichText({ text })
  await rt.detectFacets(agent)

  await agent.post({
    text: rt.text,
    facets: rt.facets,
    embed: await getBlueskyEmbedCard(url, agent),
  })
}

export const sendBlueskyPostWithEmbed = async (text: string, url: string, title: string, description: string, thumb: Blob) => {
  const agent = await getBlueskyAgent()
  const rt = new RichText({ text })
  await rt.detectFacets(agent)

  const postData = await agent.post({
    text: rt.text,
    facets: rt.facets,
    embed: await createBlueskyEmbedCard(url, title, description, thumb, agent),
  })
  
  const splitUri = postData.uri.split('/')
  const postId = splitUri[splitUri.length - 1]

  return {
    id: postId,
    handle: agent.sessionManager.session.handle
  }  
}