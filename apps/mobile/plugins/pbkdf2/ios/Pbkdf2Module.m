#import "Pbkdf2Module.h"
#import <CommonCrypto/CommonKeyDerivation.h>

@implementation Pbkdf2Module

RCT_EXPORT_MODULE(Pbkdf2);

RCT_EXPORT_METHOD(derive:(NSString *)password
                      salt:(NSString *)salt
                      iterations:(NSInteger)iterations
                      keyLength:(NSInteger)keyLength
                      hashAlg:(NSString *)hashAlg
                      resolve:(RCTPromiseResolveBlock)resolve
                      reject:(RCTPromiseRejectBlock)reject) {
  // Map JS hash names to CommonCrypto algorithm identifiers
  CCPseudoRandomAlgorithm prf;
  if ([hashAlg isEqualToString:@"sha256"]) {
    prf = kCCPRFHmacAlgSHA256;
  } else if ([hashAlg isEqualToString:@"sha1"]) {
    prf = kCCPRFHmacAlgSHA1;
  } else if ([hashAlg isEqualToString:@"sha512"]) {
    prf = kCCPRFHmacAlgSHA512;
  } else {
    reject(@"PBKDF2_ERROR", @"Unsupported hash algorithm", nil);
    return;
  }

  // Execute PBKDF2 using system CommonCrypto
  const char *passwordBytes = [password UTF8String];
  size_t passwordLen = strlen(passwordBytes);
  const char *saltBytes = [salt UTF8String];
  size_t saltLen = strlen(saltBytes);
  unsigned char derivedKey[keyLength];

  int result = CCKeyDerivationPBKDF(
    kCCPBKDF2,
    passwordBytes, passwordLen,
    saltBytes, saltLen,
    prf, (uint)iterations,
    derivedKey, (size_t)keyLength
  );

  if (result != kCCSuccess) {
    reject(@"PBKDF2_ERROR", @"CCKeyDerivationPBKDF failed", nil);
    return;
  }

  // Convert to hex string
  NSMutableString *hex = [NSMutableString stringWithCapacity:keyLength * 2];
  for (int i = 0; i < keyLength; i++) {
    [hex appendFormat:@"%02x", derivedKey[i]];
  }
  resolve(hex);
}

@end
