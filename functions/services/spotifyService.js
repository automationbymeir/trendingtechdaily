// functions/services/spotifyService.js

const axios = require("axios");
const querystring = require("querystring");
const { HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("../config");

/**
 * Retrieves a Spotify API access token using client credentials.
 * @returns {Promise<string>} The access token.
 */
async function getSpotifyAccessTokenInternal() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    logger.error("Spotify Client ID or Secret not configured in environment variables.");
    throw new HttpsError("internal", "Spotify API credentials missing.");
  }

  const authOptions = {
    method: "POST",
    url: "https://accounts.spotify.com/api/token",
    headers: {
      "Authorization": "Basic " + (Buffer.from(`${clientId}:${clientSecret}`).toString("base64")),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    data: querystring.stringify({ grant_type: "client_credentials" })
  };

  try {
    const response = await axios(authOptions);
    return response.data.access_token;
  } catch (error) {
    logger.error("Error fetching Spotify access token:", error.response ? error.response.data : error.message);
    throw new HttpsError("internal", "Could not retrieve Spotify access token.");
  }
}

/**
 * The core logic for the getTechPodcasts callable function.
 * @param {Object} data The data object from the onCall request.
 * @returns {Promise<{podcasts: Array}>}
 */
const getTechPodcastsHandler = async ({data}) => {
  try {
    const accessToken = await getSpotifyAccessTokenInternal();
    const query = data.query || "technology podcast";
    const type = data.type || "show";
    const market = data.market || "US";
    const limit = data.limit || 20;

    const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${type}&market=${market}&limit=${limit}`;

    const searchOptions = {
      method: "GET",
      url: searchUrl,
      headers: { "Authorization": `Bearer ${accessToken}` }
    };

    const searchResponse = await axios(searchOptions);

    if (searchResponse.data.shows?.items?.length > 0) {
      const podcasts = searchResponse.data.shows.items.map(show => ({
        id: show.id,
        name: show.name,
        description: show.description,
        html_description: show.html_description,
        imageUrl: show.images.length > 0 ? show.images[0].url : null,
        spotifyUrl: show.external_urls.spotify,
        publisher: show.publisher,
        total_episodes: show.total_episodes
      }));
      return { podcasts };
    } else {
      logger.warn("No shows found in Spotify response:", searchResponse.data);
      return { podcasts: [] };
    }

  } catch (error) {
    logger.error("Error in getTechPodcasts function:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Failed to fetch tech podcasts from Spotify.");
  }
};

module.exports = { getTechPodcastsHandler };