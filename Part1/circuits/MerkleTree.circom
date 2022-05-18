pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/switcher.circom"; // I LOOKED FOR IT SO LONG, IT'S SO COOL!

// To this solution I had to introduce few varables

template CheckRoot(n) { // compute the root of a MerkleTree of n Levels 
    signal input leaves[2**n];
    signal output root;

    //[assignment] insert your code here to calculate the Merkle root from 2^n leaves
    // Constant variables
    var MAX_LEAVES_NUMBER = 2**n;
    var TREE_ELEMENTS_NUMBER = (MAX_LEAVES_NUMBER * 2) - 1;
    // List of poseidon hash functions
    component poseidon[TREE_ELEMENTS_NUMBER];
    // Helper variables
    signal level;
    signal lowIndex;
    signal highIndex;

    level = MAX_LEAVES_NUMBER;
    lowIndex = MAX_LEAVES_NUMBER;
    highIndex = lowIndex + level/2;

    // Hashing leaves
    for (var i = 0; i < MAX_LEAVES_NUMBER; i++) {
        poseidon[i] = Poseidon(2);
        if (i % 2 == 0) {
            poseidon[i].inputs[0] <== leaves[i];
            poseidon[i].inputs[1] <== leaves[i+1];
        }
    }

    while (level > 0) {
        for (var i = lowIndex; i < highIndex; i++) {
            if (i % 2 == 0 && highIndex <= 2**n -1) {
                poseidon[i] = Poseidon(2);
                poseidon[i].inputs[0] <== poseidon[i - level].out;
                poseidon[i].inputs[1] <== poseidon[i - level + 1].out;
            }
        }
        level = level \ 2;
        lowIndex = highIndex;
        highIndex = highIndex + level/2;
    }

    root <== poseidon[TREE_ELEMENTS_NUMBER - 1].out;


}

template MerkleTreeInclusionProof(n) {
    signal input leaf;
    signal input path_elements[n];
    signal input path_index[n]; // path index are 0's and 1's indicating whether the current element is on the left or right
    signal output root; // note that this is an OUTPUT signal

    //[assignment] insert your code here to compute the root from a leaf and elements along the path

    // add a component to compute root with Poseidon Hash
    component pos_hash[n];
    // add a switcher component
    component switcher[n];
    // compute first hash from first two elements
    // if current index is 0 (left) then it means its our current hash
    // if it is one then it means it is a proof element
    pos_hash[0] = Poseidon(2);
    switcher[0] = Switcher();

    switcher[0].sel <== path_index[0];
    switcher[0].L <== leaf;
    switcher[0].R <== path_elements[0];

    pos_hash[0].inputs[0] <== switcher[0].outL;
    pos_hash[0].inputs[1] <== switcher[0].outR;

    // compute rest of the hashes
    for (var i = 1; i < n; i++) {
        pos_hash[i] = Poseidon(2);
        switcher[i] = Switcher();

        switcher[i].sel <== path_index[i];
        switcher[i].L <== pos_hash[i-1].out;
        switcher[i].R <== path_elements[i];

        pos_hash[i].inputs[0] <== switcher[i].outL;
        pos_hash[i].inputs[1] <== switcher[i].outR;
    }
    // get final root of a Merkle Tree
    root <== pos_hash[n-1].out;

}