// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ResearchRegistry
 * @notice On-chain registry for verifying published research papers
 * @dev Deploy this contract on both NEO X Testnet and Base
 * 
 * DEPLOYMENT INSTRUCTIONS:
 * 1. NEO X Testnet: https://neoxt4seed1.ngd.network
 *    Chain ID: 12227332
 *    Explorer: https://xt4scan.ngd.network
 * 
 * 2. Base (Mainnet or Sepolia Testnet)
 *    Base Sepolia Chain ID: 84532
 *    Explorer: https://sepolia.basescan.org
 * 
 * After deploying, provide:
 * - Contract address on each chain
 * - ABI (available in compilation artifacts)
 */
contract ResearchRegistry {
    
    struct Paper {
        bytes32 contentHash;      // SHA-256 hash of paper content
        string metadataURI;       // IPFS URI or metadata link
        address publisher;        // Address that published the paper
        uint256 timestamp;        // Block timestamp when published
        string title;             // Paper title for indexing
        bool isPublished;         // Publication status
    }
    
    mapping(bytes32 => Paper) public papers;
    
    mapping(address => bytes32[]) public publisherPapers;
    
    bytes32[] public allPaperHashes;
    
    event PaperPublished(
        bytes32 indexed contentHash,
        address indexed publisher,
        string title,
        string metadataURI,
        uint256 timestamp
    );
    
    event PaperVerified(
        bytes32 indexed contentHash,
        address indexed verifier,
        uint256 timestamp
    );
    
    /**
     * @notice Publish a research paper on-chain
     * @param _contentHash SHA-256 hash of the paper content
     * @param _title Paper title
     * @param _metadataURI IPFS URI or metadata location
     */
    function publishPaper(
        bytes32 _contentHash,
        string memory _title,
        string memory _metadataURI
    ) external {
        require(_contentHash != bytes32(0), "Invalid content hash");
        require(bytes(_title).length > 0, "Title cannot be empty");
        require(bytes(_metadataURI).length > 0, "Metadata URI cannot be empty");
        require(!papers[_contentHash].isPublished, "Paper already published");
        
        Paper memory newPaper = Paper({
            contentHash: _contentHash,
            metadataURI: _metadataURI,
            publisher: msg.sender,
            timestamp: block.timestamp,
            title: _title,
            isPublished: true
        });
        
        papers[_contentHash] = newPaper;
        
        publisherPapers[msg.sender].push(_contentHash);
        allPaperHashes.push(_contentHash);
        
        emit PaperPublished(
            _contentHash,
            msg.sender,
            _title,
            _metadataURI,
            block.timestamp
        );
    }
    
    /**
     * @notice Verify if a paper exists on-chain
     * @param _contentHash The content hash to verify
     * @return isPublished Whether the paper is published
     * @return publisher Address of the publisher
     * @return timestamp When the paper was published
     * @return title Paper title
     */
    function verifyPaper(bytes32 _contentHash) 
        external 
        view 
        returns (
            bool isPublished,
            address publisher,
            uint256 timestamp,
            string memory title
        ) 
    {
        Paper memory paper = papers[_contentHash];
        return (
            paper.isPublished,
            paper.publisher,
            paper.timestamp,
            paper.title
        );
    }
    
    /**
     * @notice Get full paper details
     * @param _contentHash The content hash
     * @return Paper struct with all details
     */
    function getPaper(bytes32 _contentHash) 
        external 
        view 
        returns (Paper memory) 
    {
        return papers[_contentHash];
    }
    
    /**
     * @notice Get all papers published by an address
     * @param _publisher Publisher address
     * @return Array of content hashes
     */
    function getPapersByPublisher(address _publisher) 
        external 
        view 
        returns (bytes32[] memory) 
    {
        return publisherPapers[_publisher];
    }
    
    /**
     * @notice Get total number of published papers
     * @return Total count
     */
    function getTotalPapers() external view returns (uint256) {
        return allPaperHashes.length;
    }
    
    /**
     * @notice Emit verification event (for tracking verification actions)
     * @param _contentHash The content hash being verified
     */
    function recordVerification(bytes32 _contentHash) external {
        require(papers[_contentHash].isPublished, "Paper not published");
        
        emit PaperVerified(
            _contentHash,
            msg.sender,
            block.timestamp
        );
    }
}
