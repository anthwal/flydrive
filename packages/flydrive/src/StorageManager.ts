/**
 * @slynova/flydrive
 *
 * @license MIT
 * @copyright Slynova - Romain Lanz <romain.lanz@slynova.ch>
 */

import { LocalFileSystemStorage } from './LocalFileSystemStorage';
import Storage from './Storage';
import { InvalidConfig, DriverNotSupported } from './exceptions';
import {
  StorageManagerConfig,
  StorageManagerDiskConfig,
  StorageManagerSingleDiskConfig,
} from './types';

type StorageConstructor<T extends Storage = Storage> = new (
  ...args: any[]
) => T;

export default class StorageManager {
  /**
   * Default disk.
   */
  readonly #defaultDisk: string | undefined;

  /**
   * Configured disks.
   */
  readonly #disksConfig: StorageManagerDiskConfig;

  /**
   * Instantiated disks.
   */
  readonly #disks: Map<string, Storage> = new Map();

  /**
   * List of available drivers.
   */
  readonly #drivers: Map<string, StorageConstructor<Storage>> = new Map();

  constructor(config: StorageManagerConfig) {
    this.#defaultDisk = config.default;
    this.#disksConfig = config.disks || {};
    this.registerDriver('local', LocalFileSystemStorage);
  }

  /**
   * Get the instantiated disks
   */
  getDisks(): Map<string, Storage> {
    return this.#disks;
  }

  /**
   * Get the registered drivers
   */
  getDrivers(): Map<string, StorageConstructor<Storage>> {
    return this.#drivers;
  }

  /**
   * Get a disk instance.
   */
  disk<T extends Storage = Storage>(name?: string): T {
    name = name ?? this.#defaultDisk;

    /**
     * No name is defined and neither there
     * are any defaults.
     */
    if (!name) {
      throw InvalidConfig.missingDiskName();
    }

    if (this.#disks.has(name)) {
      return this.#disks.get(name) as T;
    }

    const diskConfig = this.#disksConfig[name];

    /**
     * Configuration for the defined disk is missing
     */
    if (!diskConfig) {
      throw InvalidConfig.missingDiskConfig(name);
    }

    /**
     * There is no driver defined on disk configuration
     */
    if (!diskConfig.driver) {
      throw InvalidConfig.missingDiskDriver(name);
    }

    const Driver = this.#drivers.get(diskConfig.driver);
    if (!Driver) {
      throw DriverNotSupported.driver(diskConfig.driver);
    }

    const disk = new Driver(diskConfig.config);
    this.#disks.set(name, disk);
    return disk as T;
  }

  addDisk(name: string, config: StorageManagerSingleDiskConfig): void {
    if (this.#disksConfig[name]) {
      throw InvalidConfig.duplicateDiskName(name);
    }
    this.#disksConfig[name] = config;
  }

  /**
   * Register a custom driver.
   */
  public registerDriver<T extends Storage>(
    name: string,
    driver: StorageConstructor<T>,
  ): void {
    this.#drivers.set(name, driver);
  }
}
