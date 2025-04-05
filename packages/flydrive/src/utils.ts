/**
 * @slynova/flydrive
 *
 * @license MIT
 * @copyright Slynova - Romain Lanz <romain.lanz@slynova.ch>
 */

import { promisify } from 'node:util';
import { pipeline as nodePipeline } from 'node:stream';

/**
 * Returns a boolean indication if stream param
 * is a readable stream or not.
 */

export function isReadableStream(stream: any): stream is NodeJS.ReadableStream {
  return (
    stream !== null &&
    typeof stream === 'object' &&
    typeof stream.pipe === 'function' &&
    typeof stream._read === 'function' &&
    typeof stream._readableState === 'object' &&
    stream.readable !== false
  );
}

export const pipeline = promisify(nodePipeline);
