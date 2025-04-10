/**
 * @slynova/flydrive
 *
 * @license MIT
 * @copyright Slynova - Romain Lanz <romain.lanz@slynova.ch>
 */

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ClientConfig,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  Storage,
  UnknownException,
  NoSuchBucket,
  FileNotFound,
  PermissionMissing,
  SignedUrlOptions,
  Response,
  ExistsResponse,
  ContentResponse,
  SignedUrlResponse,
  StatResponse,
  FileListResponse,
  DeleteResponse,
} from '@anthwal/flydrive';
import { Readable } from 'node:stream';

function handleError(err: Error, path: string, bucket: string): Error {
  switch (err.name) {
    case 'NoSuchBucket':
      return new NoSuchBucket(err, bucket);
    case 'NoSuchKey':
      return new FileNotFound(err, path);
    case 'AllAccessDisabled':
      return new PermissionMissing(err, path);
    default:
      return new UnknownException(err, err.name, path);
  }
}

export class AmazonWebServicesS3Storage extends Storage {
  protected $driver: S3Client;
  protected $bucket: string;

  constructor(config: AmazonWebServicesS3StorageConfig) {
    super();
    this.$driver = new S3Client({
      region: config.region,
      credentials: { secretAccessKey: config.secret, accessKeyId: config.key },
      ...config,
    });
    this.$bucket = config.bucket;
  }

  /**
   * Copy a file to a location within the same bucket.
   */
  public async copy(src: string, dest: string): Promise<Response> {
    try {
      const command = new CopyObjectCommand({
        Key: dest,
        Bucket: this.$bucket,
        CopySource: `${this.$bucket}/${src}`,
      });
      const result = await this.$driver.send(command);
      return { raw: result };
    } catch (e: any) {
      throw handleError(e, src, this.$bucket);
    }
  }

  /**
   * Delete existing file.
   */
  public async delete(location: string): Promise<DeleteResponse> {
    try {
      const command = new DeleteObjectCommand({
        Key: location,
        Bucket: this.$bucket,
      });
      const result = await this.$driver.send(command);
      return { raw: result, wasDeleted: null };
    } catch (e: any) {
      throw handleError(e, location, this.$bucket);
    }
  }

  /**
   * Returns the driver.
   */
  public driver(): S3Client {
    return this.$driver;
  }

  /**
   * Determines if a file or folder already exists.
   */
  public async exists(location: string): Promise<ExistsResponse> {
    try {
      const command = new HeadObjectCommand({
        Key: location,
        Bucket: this.$bucket,
      });
      const result = await this.$driver.send(command);
      return { exists: true, raw: result };
    } catch (e: any) {
      if (e.statusCode === 404) {
        return { exists: false, raw: e };
      } else {
        throw handleError(e, location, this.$bucket);
      }
    }
  }

  /**
   * Returns the file contents.
   */
  public async get(
    location: string,
    encoding: BufferEncoding = 'utf-8',
  ): Promise<ContentResponse<string>> {
    try {
      const command = new GetObjectCommand({
        Key: location,
        Bucket: this.$bucket,
      });
      const result = await this.$driver.send(command);
      const body = (await result?.Body?.transformToString(encoding)) ?? '';
      return {
        content: body,
        raw: result,
      };
    } catch (e: any) {
      throw handleError(e, location, this.$bucket);
    }
  }

  /**
   * Returns the file contents as Buffer.
   */
  public async getBuffer(location: string): Promise<ContentResponse<Buffer>> {
    try {
      const command = new GetObjectCommand({
        Key: location,
        Bucket: this.$bucket,
      });
      const result = await this.$driver.send(command);
      const body =
        (await result?.Body?.transformToByteArray()) ?? new Uint8Array();
      const bodyBuffer = Buffer.from(body);
      return { content: bodyBuffer, raw: result };
    } catch (e: any) {
      throw handleError(e, location, this.$bucket);
    }
  }

  /**
   * Returns signed url for an existing file
   */
  public async getSignedUrl(
    location: string,
    options: SignedUrlOptions = {},
  ): Promise<SignedUrlResponse> {
    const { expiry = 3600 } = options;
    try {
      const command = new GetObjectCommand({
        Key: location,
        Bucket: this.$bucket,
      });
      const url = await getSignedUrl(this.$driver, command, {
        expiresIn: expiry,
      });
      return { signedUrl: url, raw: url };
    } catch (e: any) {
      throw handleError(e, location, this.$bucket);
    }
  }

  /**
   * Returns file's size and modification date.
   */
  public async getStat(location: string): Promise<StatResponse> {
    try {
      const command = new HeadObjectCommand({
        Key: location,
        Bucket: this.$bucket,
      });
      const result = await this.$driver.send(command);
      return {
        size: result?.ContentLength ?? 0,
        modified: result.LastModified,
        raw: result,
      };
    } catch (e: any) {
      throw handleError(e, location, this.$bucket);
    }
  }

  /**
   * Returns the stream for the given file.
   */
  public async getStream(location: string): Promise<Readable> {
    const command = new GetObjectCommand({
      Key: location,
      Bucket: this.$bucket,
    });
    const result = await this.$driver.send(command);
    return result?.Body as Readable;
  }

  /**
   * Returns url for a given key.
   */
  // public getUrl(location: string): string {
  //   const { href } = this.$driver.endpoint;
  //
  //   if (href.startsWith('https://s3.amazonaws')) {
  //     return `https://${this.$bucket}.s3.amazonaws.com/${location}`;
  //   }
  //
  //   return `${href}${this.$bucket}/${location}`;
  // }

  /**
   * Moves file from one location to another. This
   * method will call `copy` and `delete` under
   * the hood.
   */
  public async move(src: string, dest: string): Promise<Response> {
    await this.copy(src, dest);
    await this.delete(src);
    return { raw: undefined };
  }

  /**
   * Creates a new file.
   * This method will create missing directories on the fly.
   */
  public async put(
    location: string,
    content: Buffer | NodeJS.ReadableStream | Readable | string,
  ): Promise<Response> {
    try {
      const newContent =
        content instanceof ReadableStream
          ? Readable.from(content)
          : (content as string | Buffer | Readable);

      const command = new PutObjectCommand({
        Key: location,
        Body: newContent,
        Bucket: this.$bucket,
      });
      const result = await this.$driver.send(command);
      return { raw: result };
    } catch (e: any) {
      throw handleError(e, location, this.$bucket);
    }
  }

  /**
   * Iterate over all files in the bucket.
   */
  public async *flatList(prefix = ''): AsyncIterable<FileListResponse> {
    let continuationToken: string | undefined;

    do {
      try {
        const command = new ListObjectsV2Command({
          Bucket: this.$bucket,
          MaxKeys: 1000,
          ContinuationToken: continuationToken,
          Prefix: prefix,
        });
        const response = await this.$driver.send(command);
        continuationToken = response.NextContinuationToken;

        for (const file of response.Contents ?? []) {
          yield {
            raw: file,
            path: file.Key,
          };
        }
      } catch (e: any) {
        throw handleError(e, prefix, this.$bucket);
      }
    } while (continuationToken);
  }
}

export interface AmazonWebServicesS3StorageConfig extends S3ClientConfig {
  key: string;
  secret: string;
  bucket: string;
}
