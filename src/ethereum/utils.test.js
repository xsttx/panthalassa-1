import {AbortedSigningOfTx, InvalidChecksumAddress, InvalidPrivateKeyError} from "../errors";

const ethereumjsUtil = require('ethereumjs-util');
const errors = require('../errors');
const aes = require('crypto-js/aes');
const crypto = require('crypto-js');
const EE = require('eventemitter3');

import utils, {createPrivateKey, savePrivateKey, decryptPrivateKey, signTx, normalizeAddress, normalizePrivateKey} from './utils';
import osDeps from '../test_implementations/nodeJsOsDependencies';

// Private key dummy
const PRIVATE_KEY = "6b270aa6bec685e1c1d55b8b1953a410ab8c650a9dca57c46dd7a0cace55fc22";

const PRIVATE_KEY_ADDRESS = "b293D530769790b82c187f9CD1a4fA0acDcaAb82";

describe('createPrivateKey', () => {
    "use strict";

    /**
     * the createPrivateKey function uses crypto.randomBytes to generate a private ethereum key
     * if something goes wrong in the randomBytes function the promise returned promise should
     * be rejected with the node error.
     */
    test('test promise rejection if something in the randomBytes function goes wrong', () => {

        //Dummy error that will be passed from node js
        class NativeNodeError extends Error{}

        const error = new NativeNodeError();

        const osDeps  = {
            crypto: {
                randomBytes: () => new Promise((res, rej) => rej(error))
            }
        };

        // promise that resolves with the private key as a string or an error
        const privateKeyPromise = createPrivateKey(osDeps, ethereumjsUtil.isValidPrivate)();
        
        // expect to reject since we pass a error in the randomBytes mock
        return expect(privateKeyPromise).rejects.toBe(error);

    });

    /**
     * When the private key buffer is invalid the promise should be rejected
     */
    test('test that invalid privateKey reject promise', () => {

        const osDeps = {

            crypto: {
                randomBytes: jest.fn((size, cb) => {

                    return new Promise((res, rej) => res('invalid key'));

                })
            }

        };

        // promise that resolves with the private key as a string or an error
        const privateKeyPromise = createPrivateKey(osDeps, ethereumjsUtil.isValidPrivate)();

        // the promise should be rejected with an InvalidPrivateKeyError instance
        return expect(privateKeyPromise).rejects.toEqual(new errors.InvalidPrivateKeyError());

    });

    /**
     * if no errors occour the promise returned by createPrivateKey should resolve with the private key as a string
     * generated by the randomBytes method
     */
    test('test that valid private key resolve promise', () => {

        const osDeps = {

            crypto: {
                randomBytes: jest.fn((size, cb) => {

                    return new Promise((res, rej) => res(PRIVATE_KEY));

                })
            }

        };

        // promise that resolves with the private key as a string or an error
        const privateKeyPromise = createPrivateKey(osDeps, ethereumjsUtil.isValidPrivate)();

        // Expect the private key promise to resolve with the private key we used to have node's crypto.randomBytes method
        return expect(privateKeyPromise).resolves.toBe(PRIVATE_KEY);

    });

    /**
     * Here we test the "booted" createPrivateKey method.
     * As you can see this "createPrivateKey" don't take any argument's since they were already injected.
     */
    test('test create valid key with automatic dependency injection', () => {

        const promiseOfKey = utils({}, {}, osDeps).createPrivateKey();

        // This promise is only used to help with the assertion.
        // Since the privateKey can't be mocked in this test case
        // There is need for checking if he is at least valid.
        const assertionPromise = new Promise((res, rej) => {

            promiseOfKey
                .then(privateKey => {

                    if(ethereumjsUtil.isValidPrivate(Buffer.from(privateKey, 'hex'))){
                        res(true);
                        return;
                    }

                    res(new Error("Private key is invalid"));

                })
                .catch(err => rej(err))

        });

        return expect(assertionPromise).resolves.toBeTruthy();

    });

});

describe('savePrivateKey', () => {
    "use strict";

    //Save private key unencrypted
    test('save private key unencrypted', () => {

        //Mock the secure storage
        const secureStorageMock = {
            get(){},
            set: jest.fn(() => {
                return new Promise((res, rej) => { res() })
            }),
            remove(){},
            has(){},
            destroyStorage(){}
        };

        const testPromise = new Promise((res, rej) => {

            savePrivateKey(secureStorageMock, ethereumjsUtil, aes)(PRIVATE_KEY)
                .then(result => {

                    //The secure storage should have been called once
                    expect(secureStorageMock.set).toHaveBeenCalled();

                    //Expect that secure storage set is called with the prefix priv_eth_key and
                    //the related address of the private key as a "key" and with the private
                    //RAW key
                    expect(secureStorageMock.set).toBeCalledWith(
                        'PRIVATE_ETH_KEY#'+normalizeAddress(PRIVATE_KEY_ADDRESS),
                        JSON.stringify({
                            encryption: '',
                            value: PRIVATE_KEY,
                            encrypted: false,
                            version: '1.0.0'
                        })
                    );

                    //Expect that set function is called with key
                    res(result);

                })
                .catch(err => rej(err))

        });

        return expect(testPromise).resolves.toBeUndefined();

    });

    test('save the private key encrypted', () => {

        //Mock the secure storage
        const secureStorageMock = {
            get(){},
            set: jest.fn((key, value) => {
                return new Promise((res, rej) => {
                    res();
                })
            }),
            remove(){},
            has(){},
            destroyStorage(){}
        };

        const ENCRYPTED_PRIVATE_KEY = 'U2FsdGVkX19kYXZNtfZ2DhfNuao89++6weoGrSdWRA7JvlteIT0fqOfz4x+cTIw7JZy2IB3HbZUEwtlJQccT2+6bJ7aCbNSptaZ3/GHr5eFBGbc3TMpTrAGQOSztIWdq';

        const testPromise = new Promise((res, rej) => {

            const aes = {
                encrypt: jest.fn((value, password) => {

                    expect(value).toBe(PRIVATE_KEY);
                    expect(password).toBe('mypw');

                    //Mock encrypted private key
                    return 'U2FsdGVkX19kYXZNtfZ2DhfNuao89++6weoGrSdWRA7JvlteIT0fqOfz4x+cTIw7JZy2IB3HbZUEwtlJQccT2+6bJ7aCbNSptaZ3/GHr5eFBGbc3TMpTrAGQOSztIWdq';
                })
            };

            savePrivateKey(secureStorageMock, ethereumjsUtil, aes)(PRIVATE_KEY, 'mypw', 'mypw')
                .then(result => {

                    //The secure storage should have been called once
                    expect(secureStorageMock.set).toHaveBeenCalled();

                    //Expect that secure storage set is called with the prefix priv_eth_key and
                    //the related address of the private key as a "key" and with the encrypted private key
                    expect(secureStorageMock.set).toBeCalledWith(
                        'PRIVATE_ETH_KEY#'+normalizeAddress(PRIVATE_KEY_ADDRESS),
                        JSON.stringify({
                            encryption: 'AES-256',
                            value: ENCRYPTED_PRIVATE_KEY,
                            encrypted: true,
                            version: '1.0.0'
                        })
                    );

                    //Expect that set function is called with key
                    res(result);

                })
                .catch(err => rej(err))

        });

        return expect(testPromise).resolves.toBeUndefined();

    });

    test('try to save private key with one password', () => {

        return expect(utils().savePrivateKey(+PRIVATE_KEY, 'pw')).rejects.toEqual(new errors.PasswordMismatch());

    });

    test('test rejection when try to save with password that contain special chars', () => {

        //Mock the secure storage
        const secureStorageMock = {
            get(){},
            set(){},
            remove(){},
            has(){},
            destroyStorage(){}
        };

        return expect(utils(secureStorageMock).savePrivateKey(PRIVATE_KEY, "pw \n", "pw \n")).rejects.toEqual(new errors.PasswordContainsSpecialChars());
    });
    
});

describe('allKeys', () => {
    "use strict";

    test('try to fetch all', () => {

        //KeyPair 1
        const PRIVATE_KEY_ONE = 'U2FsdGVkX19kYXZNtfZ2DhfNuao89++6weoGrSdWRA7JvlteIT0fqOfz4x+cTIw7JZy2IB3HbZUEwtlJQccT2+6bJ7aCbNSptaZ3/GHr5eFBGbc3TMpTrAGQOSztIWdq';

        const PRIVATE_KEY_ONE_ADDRESS = '0xb293D530769790b82c187f9CD1a4fA0acDcaAb82';

        // KeyPair 2
        const PRIVATE_KEY_TWO = 'bb11dbe3b53369ea7a731330f17943dd71a813a1e65c82f3766d5732fc85b3da';

        const PRIVATE_KEY_TWO_ADDRESS = '0xb7eCdc30Aae0fB80C6E8a80b1B68444BEbC2CB94';

        //Mock the secure storage
        const secureStorageMock = {
            get: () => {},
            set(){},
            remove(){},
            has(){},
            destroyStorage(){},
            fetchItems: jest.fn(() => {

                return new Promise((res, rej) => {

                    // Data mock
                    res({
                        'PRIVATE_ETH_KEY#0xb293D530769790b82c187f9CD1a4fA0acDcaAb82': JSON.stringify({
                            encryption: 'AES-256',
                            encrypted: true,
                            version: '1.0.0',
                            value: PRIVATE_KEY_ONE
                        }),
                        'PRIVATE_ETH_KEY#0xb7eCdc30Aae0fB80C6E8a80b1B68444BEbC2CB94': JSON.stringify({
                            encryption: '',
                            encrypted: false,
                            version: '1.0.0',
                            value: PRIVATE_KEY_TWO
                        })
                    });

                });

            })
        };

        expect(utils(secureStorageMock).allKeyPairs()).resolves.toEqual({
            '0xb293D530769790b82c187f9CD1a4fA0acDcaAb82': {
                encryption: 'AES-256',
                encrypted: true,
                version: '1.0.0',
                value: PRIVATE_KEY_ONE
            },
            '0xb7eCdc30Aae0fB80C6E8a80b1B68444BEbC2CB94': {
                encryption: '',
                encrypted: false,
                version: '1.0.0',
                value: PRIVATE_KEY_TWO
            }
        })

    })

});

describe('getPrivateKey', () => {
    "use strict";

    test("fetch private successfully by address", () => {

        // KeyPair 1
        const PRIVATE_KEY = 'bb11dbe3b53369ea7a731330f17943dd71a813a1e65c82f3766d5732fc85b3da';

        const PRIVATE_KEY_ADDRESS = '0xb7eCdc30Aae0fB80C6E8a80b1B68444BEbC2CB94';

        //Mock the secure storage
        const secureStorageMock = {
            get: (key) => {

                return new Promise((res, rej) => {

                    //Only resolve if key matched the expected one
                    if(key === 'PRIVATE_ETH_KEY#'+PRIVATE_KEY_ADDRESS){

                        //Since the key is saved as a json string stringify the return value
                        res(JSON.stringify({
                            encryption: '',
                            encrypted: false,
                            version: '1.0.0',
                            value: PRIVATE_KEY
                        }));

                        return;
                    }

                    res();

                });



            },
            set(){},
            remove(){},
            has(){ return new Promise((res, rej) => res(true)) },
            destroyStorage(){}
        };

        return expect(utils(secureStorageMock).getPrivateKey(PRIVATE_KEY_ADDRESS))
            .resolves
            .toEqual({
                encryption: '',
                encrypted: false,
                version: '1.0.0',
                value: PRIVATE_KEY
            });

    });

    test("try to fetch private key that doesn't exist", () => {

        // KeyPair 1
        const PRIVATE_KEY = 'bb11dbe3b53369ea7a731330f17943dd71a813a1e65c82f3766d5732fc85b3da';

        const PRIVATE_KEY_ADDRESS = '0xb7eCdc30Aae0fB80C6E8a80b1B68444BEbC2CB94';

        //Mock the secure storage
        const secureStorageMock = {
            get(){},
            set(){},
            remove(){},
            has(){
                return new Promise((res, rej) => res(false))
            },
            destroyStorage(){}
        };

        return expect(utils(secureStorageMock).getPrivateKey(PRIVATE_KEY_ADDRESS))
            .rejects
            .toEqual(new errors.NoEquivalentPrivateKey())

    });

});

describe('deletePrivateKey', () => {
    "use strict";

    test('delete key that does not exist', () => {

        const PRIVATE_KEY_ADDRESS = '0xb7eCdc30Aae0fB80C6E8a80b1B68444BEbC2CB94';

        //Mock the secure storage
        const secureStorageMock = {
            get(){},
            set(){},
            remove(){},
            has(){
                return new Promise((res, rej) => res(false))
            },
            destroyStorage(){}
        };

        return expect(utils(secureStorageMock).deletePrivateKey(PRIVATE_KEY_ADDRESS))
            .rejects
            .toEqual(new errors.NoEquivalentPrivateKey())

    });

    test('delete private key successfully', () => {

        //Mock the secure storage
        const secureStorageMock = {
            get(){},
            set(){},
            remove: jest.fn(),
            has(){
                return new Promise((res, rej) => res(true))
            },
            destroyStorage(){}
        };

        return expect(new Promise((res, rej) => {

            utils(secureStorageMock)
                .deletePrivateKey(PRIVATE_KEY_ADDRESS)
                .then(response => {

                    //When the promise resolve remove should have been called once
                    expect(secureStorageMock.remove).toHaveBeenCalled();
                    
                    res(response);

                })
                .catch(err => rej(err));

        }))
            .resolves
            .toBeUndefined();

    });

});

describe('decryptPrivateKey', () => {
    "use strict";

    test('decrypt successfully', () => {

        const pubEE = new EE();

        const PRIVATE_KEY_ONE = 'U2FsdGVkX19GTRU0W5qgP9nCA0+4PVM3LmbIxQRW6d6Ky1i5fwaU9Cj4DbHoWLw/hRivOJJasxCSP6by6MxWNZjCOsqzkKl1ud99+QgU4oHUYncnni35rETjW+QHDTni';

        return expect(new Promise((res, rej) => {

            //Listen for decryption dialog
            pubEE.on('eth:decrypt-private-key', (eventData) => {
                expect(eventData.topic).toBe('ethereum');
                expect(eventData.reason).toBe('display private key');
                eventData.successor("mypw")
                    .then(privateKey => {})
                    .catch(err => reject(err));
            });

            //Boot decryption function
            const decryptPrivatekey = decryptPrivateKey(pubEE, crypto, ethereumjsUtil);

            decryptPrivatekey({encryption: 'AES-256', value: PRIVATE_KEY_ONE}, 'display private key', 'ethereum')
                .then(privateKey => res(privateKey))
                .catch(err => rej(err));

        }))
            .resolves
            .toEqual("bb11dbe3b53369ea7a731330f17943dd71a813a1e65c82f3766d5732fc85b3da");

    });

    test('decryption failed (wrong password)', () => {

        const pubEE = new EE();

        return expect(new Promise((res, rej) => {

            //Listen for decryption dialog
            pubEE.on('eth:decrypt-private-key', (eventData) => {
                expect(eventData.topic).toBe('ethereum');
                expect(eventData.reason).toBe('display private key');
                eventData.successor("wrong-pw")
                    .then(privateKey => res(privateKey))
                    .catch(err => rej(err));
            });

            //Boot decryption function
            const decryptPrivatekey = decryptPrivateKey(pubEE, crypto, ethereumjsUtil);

            decryptPrivatekey({encryption: 'AES-256', value: 'private_key'}, 'display private key', 'ethereum');

        }))
            .rejects
            .toEqual(new errors.FailedToDecryptPrivateKeyPasswordInvalid());

    });

    test('unknown encryption algorithm', () => {

        return expect(utils().decryptPrivateKey({encryption: 'NO_NAME'})).rejects.toEqual(new errors.InvalidEncryptionAlgorithm());

    });

    test('decrypted value is not a private key', () => {

        const pubEE = new EE();

        return expect(new Promise((res, rej) => {

            //Listen for decryption dialog
            pubEE.on('eth:decrypt-private-key', (eventData) => {
                expect(eventData.topic).toBe('ethereum');
                expect(eventData.reason).toBe('display private key');
                eventData.successor("wrong-pw")
                    .then(privateKey => res(privateKey))
                    .catch(err => rej(err));
            });

            //Boot decryption function
            const decryptPrivatekey = decryptPrivateKey(pubEE, crypto, ethereumjsUtil);

            decryptPrivatekey({encryption: 'AES-256', value: 'private_key'}, 'display private key', 'ethereum');

        }))
            .rejects
            .toEqual(new errors.DecryptedValueIsNotAPrivateKey());

    });

});

describe('signTx', () => {

    //Sample tx data
    const txData = {
        nonce: '0x03',
        gas: '0x5208',
        from: '0xae481410716b6d087261e0d69480b4cb9305c624',
        to: '0x814944ed940f27eb40330882a24baad21c30818e',
        value: '0x1',
        gasPrice: '0x4a817c800'
    };

    //sample private key
    const privateKey:string = "affd0b4039708432bb2759fc747bf7b9b1fbdab71bf86eab6d812ae83419b708";

    //signed transaction
    const signedTx = 'f864038504a817c80082520894814944ed940f27eb40330882a24baad21c30818e01801ba063a5002e8054f7c95e4520ad4ef7739e8d66adc3a11d511b53b15388d6cd8c84a0212ccf0f79cc23a1f53aa8f90e8210633bceb2c85d6797bd0acfdec874c5b092';

    /**
     * Sign transaction
     */
    test('successfully', () => {

        const ee = new EE();

        //Eventlistener must call the confirm method
        ee.on('eth:tx:sign', function(data){

            //Confirm transaction
            data.confirm();

        });

        //Test promise that signs tx data and transform it to hex string
        const testPromise = new Promise((res, rej) => {

            //Const tx
            const tx = signTx(ethereumjsUtil.isValidPrivate, ee)(txData, privateKey);

            tx
                .then(signedTx => {
                    res(signedTx.serialize().toString('hex'))
                })
                .catch(e => rej(e));

        });

        return expect(testPromise).resolves.toBe(signedTx)

    });

    /**
     * Reject the transaction
     */
    test('rejected', () => {

        const ee = new EE();

        //Eventlistener must call the confirm method
        ee.on('eth:tx:sign', function(data){

            //Abort the transaction will reject the promise
            data.abort();

        });

        //Test promise that signs tx data and transform it to hex string
        const testPromise = new Promise((res, rej) => {

            //Const tx
            const tx = signTx(ethereumjsUtil.isValidPrivate, ee)(txData, privateKey);

            tx
                .then(signedTx => {
                    res(signedTx.serialize().toString('hex'))
                })
                .catch(e => rej(e));

        });

        return expect(testPromise).rejects.toEqual(new AbortedSigningOfTx());

    });

});

describe('normalizeAddress', () => {

    test('success', () => {

        const expectedAddress = '0x9493b5595FBbe6f8ca94c6CccA90420bbd5a4C8c';

        expect(normalizeAddress(expectedAddress)).toBe(expectedAddress);

    });

    test('error', () => {

        expect(function(){
            normalizeAddress('I_AM_AN_ADDRESS')
        }).toThrowError('Address: I_AM_AN_ADDRESS is invalid');

    })

});

describe('normalizePrivateKey', () => {

    test('success', () => {

        const expectedPrivateKey = '6b270aa6bec685e1c1d55b8b1953a410ab8c650a9dca57c46dd7a0cace55fc22';

        expect(normalizePrivateKey(expectedPrivateKey)).toBe(expectedPrivateKey);

    });

    test('error', () => {

        const invalidPrivateKey = '0x6b270aa6bec685e1c1d55b8b1953a410ab8c650a9dca57c46dd7a0cace55fc22';

        expect(function(){
            normalizePrivateKey(invalidPrivateKey)
        }).toThrowError(InvalidPrivateKeyError);

    })

});

describe('privateKeyToMnemonic', () => {

    test('invalid private key', () => {

        expect(function () {
            utils().privateKeyToMnemonic('i am invalid')
        }).toThrow();

    });

    test('success', () => {

        const privateKey = 'a21e66de112c10617852adaeb67241309fbdc5f21de796d16544829239d71ade';

        const expectedMnemonic = 'pear veteran resource car scissors cost throw fiber push receive motion gentle wink title silent rude nothing menu eye ahead castle twist hidden service';

        expect(utils().privateKeyToMnemonic(privateKey))
            .toEqual(expectedMnemonic.split(' '));

    });

});

test('mnemonicToPrivateKey', () => {

    const privateKey = 'a21e66de112c10617852adaeb67241309fbdc5f21de796d16544829239d71ade';

    const mnemonic = 'pear veteran resource car scissors cost throw fiber push receive motion gentle wink title silent rude nothing menu eye ahead castle twist hidden service';

    expect(utils().mnemonicToPrivateKey(mnemonic))
        .toEqual(privateKey)

});

describe('mnemonicValid', () => {

    test('false', () => {

        expect(utils().mnemonicValid('invalid bla bla bla')).toBe(false);

    });

    test('true', () => {

        expect(utils().mnemonicValid('pear veteran resource car scissors cost throw fiber push receive motion gentle wink title silent rude nothing menu eye ahead castle twist hidden service')).toBe(true);

    })

});
