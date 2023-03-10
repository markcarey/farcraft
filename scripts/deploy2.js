const cdaABI = [{"inputs":[],"name":"EmptyBytecode","type":"error"},{"inputs":[],"name":"FailedDeploy","type":"error"},{"inputs":[],"name":"FailedInit","type":"error"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"bytes32","name":"bytecodeHash","type":"bytes32"},{"indexed":true,"internalType":"bytes32","name":"salt","type":"bytes32"},{"indexed":true,"internalType":"address","name":"deployedAddress","type":"address"}],"name":"Deployed","type":"event"},{"inputs":[{"internalType":"bytes","name":"bytecode","type":"bytes"},{"internalType":"bytes32","name":"salt","type":"bytes32"}],"name":"deploy","outputs":[{"internalType":"address","name":"deployedAddress_","type":"address"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bytes","name":"bytecode","type":"bytes"},{"internalType":"bytes32","name":"salt","type":"bytes32"},{"internalType":"bytes","name":"init","type":"bytes"}],"name":"deployAndInit","outputs":[{"internalType":"address","name":"deployedAddress_","type":"address"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bytes","name":"bytecode","type":"bytes"},{"internalType":"address","name":"sender","type":"address"},{"internalType":"bytes32","name":"salt","type":"bytes32"}],"name":"deployedAddress","outputs":[{"internalType":"address","name":"deployedAddress_","type":"address"}],"stateMutability":"view","type":"function"}];
const cdaAddress = '0x98B2920D53612483F91F12Ed7754E51b4A77919e';

const zeroAddress = "0x0000000000000000000000000000000000000000";
const chain = hre.network.name;

const nftJSON = require("../artifacts/contracts/Farcraft.sol/Farcraft.json");
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PUBLIC_KEY = process.env.PUBLIC_KEY;
const signer = new ethers.Wallet(PRIVATE_KEY, ethers.provider);

// Gas
const gasOptions = {"maxPriorityFeePerGas": "311000000000", "maxFeePerGas": "311000000016" };

const v = "two";
const salt = ethers.utils.formatBytes32String(v);

const ABI = ["function initialize(string memory _name, string memory _symbol, address _lzEndpoint, address sender, uint16[] memory remoteChainIds, address _streamer, uint16 _streamChainId, string calldata _uri)"];
const iface = new ethers.utils.Interface(ABI);

const name = "Farcraft";
const symbol = "FAR";
const baseUri = "https://api.farcraft.xyz/meta/";
var streamer = zeroAddress;
var streamChainId = 0;
if (chain == "polygon") {
    streamer = "0x1a29779F20634566ed8465f62Df3Ae9913Bc36B7";  // TODO: change this
} else {
    //streamChainId = 10109;  // mumbai
    streamChainId = 109;  // polygon
}
var addr = {};
addr.goerli = {
    "lzEndpoint": "0xbfD2135BFfbb0B5378b56643c2Df8a87552Bfa23",
    "chainId": 10121
};
addr.mumbai = {
    "lzEndpoint": "0xf69186dfBa60DdB133E91E9A4B5673624293d8F8",
    "chainId": 10109
};
addr["arbitrum-goerli"] = {
    "lzEndpoint": "0x6aB5Ae6822647046626e83ee6dB8187151E1d5ab",
    "chainId": 10143
};
addr.polygon = {
    "lzEndpoint": "0x3c2269811836af69497E5F486A85D7316753cf62",
    "chainId": 109
};
addr.ethereum = {
    "lzEndpoint": "0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675",
    "chainId": 101
};
addr.optimism = {
    "lzEndpoint": "0x3c2269811836af69497E5F486A85D7316753cf62",
    "chainId": 111
};
addr.arbitrum = {
    "lzEndpoint": "0x3c2269811836af69497E5F486A85D7316753cf62",
    "chainId": 110
};
const targetChains = [ "polygon", "ethereum", "optimism", "arbitrum" ];
var chainIds = [];

for (let i = 0; i < targetChains.length; i++) {
    var thisChain = targetChains[i];
    if ( thisChain == chain ) {
        // do nothing
    } else {
        chainIds.push(addr[thisChain].chainId);
    }
}
console.log(chainIds);
const init = iface.encodeFunctionData("initialize", [ name, symbol, addr[chain].lzEndpoint, PUBLIC_KEY, chainIds, streamer, streamChainId, baseUri ]);


async function main() {

    const factory = new ethers.Contract(cdaAddress, cdaABI, signer);
    const result = await factory.deployAndInit(nftJSON.bytecode, salt, init, gasOptions);
    console.log(result);
    await result.wait();

}

main()
   .then(() => process.exit(0))
   .catch(error => {
     console.error(error);
     process.exit(1);
   });