const {network} = require("hardhat");
const{verify} = require("../utils/verify");
const {developmentChains, networkConfig} = require("../helper-hardhat-config");
const {storeImages, storeTokenUriMetaData} = require("../utils/uploadToPinata");
const fs = require("fs");
const { networkInterfaces } = require("os");
require("dotenv").config();

const imagesLocation = "./images/randomNft";

const metaDataTemplate = {
    name: "",
    description: "",
    image: "",
    attribute: [
        {
        trait_type: "Cuteness",
        value: 100,
        },
    ],
};

module.exports = async function({getNamedAccounts ,deployments}){
    const {deploy, log} = deployments;
    const {deployer} = await getNamedAccounts();
    const chainId = network.config.chainId;
    let tokenUris;
    if(process.env.UPLOAD_TO_PINATA === "true"){
        tokenUris = await handleTokenUris();
    }

    let vrfCoordinatorV2Address, subscriptionId;

    if(developmentChains.includes(network.name)){
        const vrfCoordinatorV2Mock = await deployments.get("VRFCoordinatorV2Mock");
        const vrfCoordinatorV2 = await ethers.getContractAt("VRFCoordinatorV2Mock",vrfCoordinatorV2Mock.address);
        vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address;
        const tx = await vrfCoordinatorV2.createSubscription();
        const txReceipt = await tx.wait(1);

        subscriptionId = txReceipt.logs[0].args.subId;
    }else{
        vrfCoordinatorV2Address = networkConfig[chainId].vrfCoordinatorV2;
        subscriptionId = networkConfig[chainId].subscriptionId;
    }

    log("-------------------");

    const args = [vrfCoordinatorV2Address, subscriptionId, networkConfig[chainId].gasLane, networkConfig[chainId].callbackGasLimit,  tokenUris,  networkConfig[chainId].mintFee];
    const randomIpfs = await deploy("RandomIpfsNft",{
        from: deployer,
        args: args,
        log: true,
        waitConfirmations: network.config.blockConfirmation || 1,
    });

    if (chainId == 31337) {
        await vrfCoordinatorV2Mock.addConsumer(subscriptionId, randomIpfs.address)
    }

    log("-----------------------------");
    
    if(!developmentChains.includes(network.name) && process.env.ETHER_API){
        log("Verifying");
        await verify(randomIpfs.address, args);
    }

}

async function handleTokenUris() {
    tokenUris = [];

    const {responses: imageUploadResponses, files} =await storeImages(imagesLocation);

    for(const imageUploadResponsesIndex in imageUploadResponses){
        let tokenUriMetaData = { ...metaDataTemplate};
        tokenUriMetaData.name = files[imageUploadResponsesIndex].replace(".png", "");
        tokenUriMetaData.description = `An adorable ${tokenUriMetaData.name}`;
        tokenUriMetaData.image = `ipfs://${imageUploadResponses[imageUploadResponsesIndex].IpfsHash}`;
        console.log(`Uploding ${tokenUriMetaData.name}`);

        const metaDataUploadResponse = await storeTokenUriMetaData(tokenUriMetaData);
        tokenUris.push(`ipfs://${metaDataUploadResponse.IpfsHash}`);
    }
    console.log("Token Uris uploaded");
    console.log(tokenUris);
    return tokenUris;
}

module.exports.tags = ["all", "randomIpfs", "main"]