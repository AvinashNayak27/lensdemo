import {  useState, useRef } from "react";
import { ethers } from "ethers";
import {
  LensClient,
  development,
  isCreateDataAvailabilityPublicationResult,
} from "@lens-protocol/client";
import axios from "axios";
import { v4 as uuid } from "uuid";
import FormData from "form-data";

const lensClient = new LensClient({
  environment: development,
});

const Authenticate = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [postId, setPostId] = useState("");
  const [profile, setProfile] = useState(null);
  const fileInputRef = useRef(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [content, setContent] = useState("");

  const authenticate = async () => {
    if (typeof window.ethereum !== "undefined") {
      // Request account access if needed
      await window.ethereum.enable();

      // We don't know window.ethereum prior to runtime.
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();

      const address = await signer.getAddress();

      const challenge = await lensClient.authentication.generateChallenge(
        address
      );
      const signature = await signer.signMessage(challenge);

      await lensClient.authentication.authenticate(address, signature);

      // check the state with
      const isAuthenticated = await lensClient.authentication.isAuthenticated();
      console.log(isAuthenticated);
      setIsAuthenticated(isAuthenticated);
      const allOwnedProfiles = await lensClient.profile.fetchAll({
        ownedBy: [address],
        limit: 1,
      });
      const defaultProfile = allOwnedProfiles.items[0];
      setProfile(defaultProfile);
    }
  };
  const logout = async () => {
    setIsAuthenticated(false);
    setProfile(null);
    setPostId("");
    setStatusMessage("");
    setContent("");
  };
  const uploadWithBundlr = async (data) => {
    try {
      const response = await axios.post(
        "https://safeupload.fly.dev/uploadWithBundlr",
        data
      );
      console.log(response.data.contentURI);
      return response.data.contentURI;
    } catch (error) {
      console.error(error);
    }
  };

  const uploadAndGenerateSnapshots = async (file) => {
    try {
      const uploadURL = "https://safeupload.fly.dev/upload";
      const generateSnapshotsURL = "https://safeupload.fly.dev/nsfwcheck";

      const formData = new FormData();
      formData.append("video", file);

      const uploadResponse = await axios.post(uploadURL, formData);

      const videoPath = uploadResponse.data.uploadPath;
      const generateSnapshotsResponse = await axios.post(generateSnapshotsURL, {
        videoPath,
      });
      console.log(generateSnapshotsResponse.data);

      if (generateSnapshotsResponse.data?.nsfwContent?.length === 1) {
        setStatusMessage("No NSFW content detected. uploading to Livepeer ...");
        const assetResponse = await axios.post(
          "https://safeupload.fly.dev/uploadtolivepeer",
          {
            name: videoPath.slice(0, -4).split("/").pop(),
            description: "Test for NSFW content",
            videoUrl: videoPath,
          }
        );
        return assetResponse?.data?.asset[0]?.playbackUrl;
      } else {
        setStatusMessage(
          "NSFW content detected : " + generateSnapshotsResponse?.data?.nsfwContent[1]
        );
        throw new Error(
          "NSFW content detected. Asset not uploaded to Livepeer"
        );

      }
    } 
    catch (error) {
      console.error("Operation failed:", error.message);
    }
  };

  const createPost = async () => {
    setStatusMessage("Creating post...");

    const file = fileInputRef.current.files[0];
    if (!file) {
      console.error("No file selected");
      setStatusMessage("No file selected");
      return;
    }
    const url = await uploadAndGenerateSnapshots(file);
    if (!url) {
      throw new Error(`Something went wrong while uploading the video.`);
    }
    const publicationMetadataMedia = [
      {
        item: url,
        type: "video/mp4",
        altTag: "A sample video media",
        cover:
          "https://ik.imagekit.io/lens/media-snapshot/d5c5ea74cc7abc253c92ba1dc50583791ef2f761a289818ff9a849a757b3629c.png",
      },
    ];
    setStatusMessage("Video uploaded, creating post metadata...");

    const metadata = {
      appId: "lenster",
      attributes: [
        {
          displayType: "string",
          traitType: "Created with",
          value: "LensClient SDK",
        },
      ],
      content: content + "\n via @safeupload.test ",
      name: "Hello World",
      mainContentFocus: "VIDEO",
      media: publicationMetadataMedia,
      locale: "en-US",
      metadata_id: uuid(),
      tags: ["lens-sdk"],
      version: "2.0.0",
    };
    const validateResult = await lensClient.publication.validateMetadata(
      metadata
    );
    console.log(validateResult);

    if (!validateResult.valid) {
      setStatusMessage("Metadata is not valid.");

      throw new Error(`Metadata is not valid.`);
    }
    setStatusMessage("Metadata validated, uploading to Bundlr...");

    const contentURI = await uploadWithBundlr(metadata);
    const profileId = profile?.id;

    console.log(`Post metadata was uploaded to ${contentURI}`);
    setStatusMessage("Metadata uploaded, creating post...");
    const authenticateResult = await lensClient.authentication.isAuthenticated();

    if (authenticateResult) {
      const createPostResult =
        await lensClient.publication.createDataAvailabilityPostViaDispatcher({
          from: profileId,
          contentURI,
        });

      // createPostResult is a Result object
      const createPostResultValue = createPostResult.unwrap();

      if (!isCreateDataAvailabilityPublicationResult(createPostResultValue)) {
        console.log(`Something went wrong`, createPostResultValue);
        setStatusMessage("Something went wrong while creating the post.");
        return;
      }

      console.log(`DA post was created: `, createPostResultValue);
      setStatusMessage("Post created on lens successfully!");

      setPostId(createPostResultValue.id);
    } else {
      console.log(`User is not authenticated`);
      setStatusMessage("User is not authenticated");
      alert("Please authenticate first");

    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-8 m-4 bg-white rounded shadow-md">
        <h1 className="mb-5 text-3xl font-bold text-center text-blue-500">Safe Upload</h1>
        <button
          className="w-full px-4 py-2 mb-4 text-white bg-green-500 rounded hover:bg-green-700"
          onClick={authenticate}
        >
          Sign in with Lens
        </button>
        <p className="text-lg text-center">
          {isAuthenticated ? "Authenticated" : "Not authenticated"}
        </p>
        {isAuthenticated && (
          <>
            <p className="mt-4 text-lg text-center">Logged in as: {profile?.handle}</p>
            <input
              className="w-full p-2 mt-4 border border-gray-400 rounded"
              type="file"
              ref={fileInputRef}
              onChange={() => {
                setPostId("");
                setStatusMessage("");
                setContent("");
              }}
            />
            <input
              className="w-full p-2 mt-4 border border-gray-400 rounded"
              type="text"
              placeholder="Enter your post content"
              onChange={(e) => {
                setContent(e.target.value);
              }}
              value={content}
            />
            <button
              className="w-full px-4 py-2 mt-4 text-white bg-yellow-500 rounded hover:bg-yellow-700"
              onClick={createPost}
            >
              Create Post
            </button>
            {statusMessage && <p className="mt-4 text-lg text-center">{statusMessage}</p>}

            {postId && (
              <>
                <p className="mt-4 text-lg text-center">Post Id: {postId}</p>
                <a
                  href={`https://testnet.lenster.xyz/posts/${postId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <button className="w-full px-4 py-2 mt-4 text-white bg-yellow-500 rounded hover:bg-yellow-700">
                    View Post on lenster
                  </button>
                </a>
              </>
            )}
            <button
              className="w-full px-4 py-2 mt-4 text-white bg-red-500 rounded hover:bg-red-700"
              onClick={logout}
            >
              Logout
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default Authenticate;
