import { Handler } from '../handler.class';
import { Provider } from '../provider.model';
import * as Vultr from '@vultr/vultr-node';
import * as sleep from 'await-sleep';
import { Game } from '../../games/game.model';
import { Server } from '../../servers/server.model';
import { VULTR_STARTUP_SCRIPT as TF2_STARTUP_SCRIPT } from '../../../assets/tf2';
import { VULTR_STARTUP_SCRIPT as VALHEIM_STARTUP_SCRIPT } from '../../../assets/valheim';
import { VULTR_STARTUP_SCRIPT as MINECRAFT_STARTUP_SCRIPT } from '../../../assets/minecraft';
import * as config from '../../../../config.json';
import { writeFileSync } from 'fs';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const SSH2Promise = require('ssh2-promise');
const label = config.instance.label;

export class VultrHandler extends Handler {
  private api: {
    account: { getAccountInfo: (parameters: any) => any };
    applications: { listApplications: (parameters: any) => any };
    backups: {
      listBackups: (parameters: any) => any;
      getBackup: (parameters: any) => any;
    };
    bareMetal: {
      listInstances: (parameters: any) => any;
      createInstance: (parameters: any) => any;
      getInstance: (parameters: any) => any;
      updateInstance: (parameters: any) => any;
      deleteInstance: (parameters: any) => any;
      getInstanceIpv4Addresses: (parameters: any) => any;
      getInstanceIpv6Addresses: (parameters: any) => any;
      startInstance: (parameters: any) => any;
      rebootInstance: (parameters: any) => any;
      reinstallInstance: (parameters: any) => any;
      haltInstance: (parameters: any) => any;
      getInstanceBandwidth: (parameters: any) => any;
      haltInstances: (parameters: any) => any;
      rebootInstances: (parameters: any) => any;
      startInstances: (parameters: any) => any;
      getInstanceUserData: (parameters: any) => any;
      getInstanceAvailableUpgrades: (parameters: any) => any;
      getInstanceVncUrl: (parameters: any) => any;
    };
    blockStorage: {
      listStorages: (parameters: any) => any;
      createStorage: (parameters: any) => any;
      getStorage: (parameters: any) => any;
      deleteStorage: (parameters: any) => any;
      updateStorage: (parameters: any) => any;
      attachStorage: (parameters: any) => any;
      detachStorage: (parameters: any) => any;
    };
    dns: {
      listDomains: (parameters: any) => any;
      createDomain: (parameters: any) => any;
      getDomain: (parameters: any) => any;
      deleteDomain: (parameters: any) => any;
      updateDomain: (parameters: any) => any;
      getSoaInfo: (parameters: any) => any;
      updateSoaInfo: (parameters: any) => any;
      getDnsSecInfo: (parameters: any) => any;
      createRecord: (parameters: any) => any;
      listRecords: (parameters: any) => any;
      getRecord: (parameters: any) => any;
      updateRecord: (parameters: any) => any;
      deleteRecord: (parameters: any) => any;
    };
    firewall: {
      listGroups: (parameters: any) => any;
      createGroup: (parameters: any) => any;
      getGroup: (parameters: any) => any;
      updateGroup: (parameters: any) => any;
      deleteGroup: (parameters: any) => any;
      listRules: (parameters: any) => any;
      createRules: (parameters: any) => any;
      deleteRule: (parameters: any) => any;
      getRule: (parameters: any) => any;
    };
    instances: {
      listInstances: (parameters: any) => any;
      createInstance: (parameters: any) => any;
      getInstance: (parameters: any) => any;
      updateInstance: (parameters: any) => any;
      deleteInstance: (parameters: any) => any;
      haltInstances: (parameters: any) => any;
      rebootInstances: (parameters: any) => any;
      startInstances: (parameters: any) => any;
      startInstance: (parameters: any) => any;
      rebootInstance: (parameters: any) => any;
      reinstallInstance: (parameters: any) => any;
      getInstanceBandwidth: (parameters: any) => any;
      getInstanceNeighbors: (parameters: any) => any;
      listInstancePrivateNetworks: (parameters: any) => any;
      getInstanceIsoStatus: (parameters: any) => any;
      attachIsoToInstance: (parameters: any) => any;
      detachIsoFromInstance: (parameters: any) => any;
      attachPrivateNetworkToInstance: (parameters: any) => any;
      detachPrivateNetworkFromInstance: (parameters: any) => any;
      setInstanceBackupSchedule: (parameters: any) => any;
      getInstanceBackupSchedule: (parameters: any) => any;
      restoreInstance: (parameters: any) => any;
      listInstanceIpv4Information: (parameters: any) => any;
      createInstanceIpv4: (parameters: any) => any;
      getInstanceIpv6Information: (parameters: any) => any;
      createInstanceReverseIpv6: (parameters: any) => any;
      listInstanceIpv6ReverseInformation: (parameters: any) => any;
      createInstanceReverseIpv4: (parameters: any) => any;
      getInstanceUserData: (parameters: any) => any;
      haltInstance: (parameters: any) => any;
      setDefaultReverseDnsEntry: (parameters: any) => any;
      deleteIpv4Address: (parameters: any) => any;
      deleteInstanceReverseIpv6: (parameters: any) => any;
      getAvailableInstanceUpgrades: (parameters: any) => any;
    };
    iso: {
      listIsos: (parameters: any) => any;
      createIso: (parameters: any) => any;
      getIso: (parameters: any) => any;
      deleteIso: (parameters: any) => any;
      listPublicIsos: (parameters: any) => any;
    };
    loadBalancers: {
      listLoadBalancers: (parameters: any) => any;
      createLoadBalancer: (parameters: any) => any;
      getLoadBalancer: (parameters: any) => any;
      updateLoadBalancer: (parameters: any) => any;
      deleteLoadBalancer: (parameters: any) => any;
      listForwardingRules: (parameters: any) => any;
      createForwardingRule: (parameters: any) => any;
      getForwardingRule: (parameters: any) => any;
      deleteForwardingRule: (parameters: any) => any;
      listFirewallRules: (parameters: any) => any;
      getFirewallRule: (parameters: any) => any;
    };
    kubernetes: {
      createKubernetesCluster: (parameters: any) => any;
      listKubernetesClusters: (parameters: any) => any;
      getKubernetesCluster: (parameters: any) => any;
      updateKubernetesCluster: (parameters: any) => any;
      deleteKubernetesCluster: (parameters: any) => any;
      deleteKubernetesClusterAndResources: (parameters: any) => any;
      getKubernetesResources: (parameters: any) => any;
      createNodePool: (parameters: any) => any;
      listNodePools: (parameters: any) => any;
      getNodePool: (parameters: any) => any;
      updateNodePool: (parameters: any) => any;
      deleteNodePool: (parameters: any) => any;
      deleteNodePoolInstance: (parameters: any) => any;
      recycleNodePoolInstance: (parameters: any) => any;
      getKubernetesClusterKubeconfig: (parameters: any) => any;
      getKubernetesVersions: (parameters: any) => any;
    };
    objectStorage: {
      listObjectStorages: (parameters: any) => any;
      createObjectStorage: (parameters: any) => any;
      getObjectStorage: (parameters: any) => any;
      deleteObjectStorage: (parameters: any) => any;
      updateObjectStorage: (parameters: any) => any;
      regenerateObjectStorageKeys: (parameters: any) => any;
      getAllClusters: (parameters: any) => any;
    };
    operatingSystems: { listImages: (parameters: any) => any };
    plans: {
      listPlans: (parameters: any) => any;
      listBareMetalPlans: (parameters: any) => any;
    };
    privateNetworks: {
      getPrivateNetwork: (parameters: any) => any;
      deletePrivateNetwork: (parameters: any) => any;
      updatePrivateNetwork: (parameters: any) => any;
      listPrivateNetworks: (parameters: any) => any;
      createPrivateNetwork: (parameters: any) => any;
    };
    regions: {
      listRegions: (parameters: any) => any;
      listAvailableComputeInRegion: (parameters: any) => any;
    };
    reservedIps: {
      getReservedIp: (parameters: any) => any;
      deleteReservedIp: (parameters: any) => any;
      listReservedIps: (parameters: any) => any;
      createReservedIp: (parameters: any) => any;
      attachReservedIp: (parameters: any) => any;
      detachReservedIp: (parameters: any) => any;
      convertInstanceIpToReservedIp: (parameters: any) => any;
    };
    snapshots: {
      deleteSnapshot: (parameters: any) => any;
      getSnapshot: (parameters: any) => any;
      updateSnapshot: (parameters: any) => any;
      listSnapshots: (parameters: any) => any;
      createSnapshot: (parameters: any) => any;
      createSnapshotFromUrl: (parameters: any) => any;
    };
    sshKeys: {
      getSshKey: (parameters: any) => any;
      updateSshKey: (parameters: any) => any;
      deleteSshKey: (parameters: any) => any;
      listSshKeys: (parameters: any) => any;
      createSshKey: (parameters: any) => any;
    };
    startupScripts: {
      getStartupScript: (parameters: any) => any;
      deleteStartupScript: (parameters: any) => any;
      updateStartupScript: (parameters: any) => any;
      listStartupScripts: (parameters: any) => any;
      createStartupScript: (parameters: any) => any;
    };
    users: {
      getUser: (parameters: any) => any;
      deleteUser: (parameters: any) => any;
      updateUser: (parameters: any) => any;
      getUsers: (parameters: any) => any;
      createUser: (parameters: any) => any;
    };
  };

  constructor(provider: Provider, game: Game) {
    super(provider);

    provider.metadata = {
      ...provider.metadata,
      ...game.data.providerOverrides.vultr,
    };

    this.api = Vultr.initialize({
      apiKey: provider.metadata.vultrApiKey,
    });
  }

  async createInstance(server: Server): Promise<Server> {
    const [_server, script] = this.getDefaultOptions(server, {
      tf2: TF2_STARTUP_SCRIPT,
      minecraft: MINECRAFT_STARTUP_SCRIPT,
      valheim: VALHEIM_STARTUP_SCRIPT,
    });
    server = _server;

    try {
      let image;

      const { snapshots } = await this.api.snapshots.listSnapshots({});
      for (const i of snapshots) {
        if (i.description === this.provider.metadata.vultrImageName) {
          image = i.id;
        }
      }

      if (!image) {
        throw new Error(
          `Could not find snapshot with name "${this.provider.metadata.vultrImageName}"`,
        );
      }

      const opts = {
        region: this.provider.metadata.vultrLocationId,
        plan: this.provider.metadata.vultrPlanId,
        snapshot_id: image,
        sshkey_id: this.provider.metadata.vultrSSHKeys,
        label: `${label}-${server.id}`,
      };
      const instanceInfo = await this.api.instances.createInstance(opts);
      const instance = instanceInfo.instance.id;

      if (!instance) {
        throw new Error('Failed to start server');
      }

      let serverInfo;
      let retry = 0;
      while (
        !(
          serverInfo?.status === 'active' &&
          serverInfo?.power_status === 'running'
        )
      ) {
        const info = await this.api.instances.getInstance({
          'instance-id': instance,
        });
        serverInfo = info.instance;
        this.logger.debug(
          `Server status ${serverInfo.status} ${serverInfo.power_status} ${serverInfo.server_state}`,
        );
        await sleep(5000);

        if (retry++ === 60) {
          throw new Error('Failed to start server');
        }
      }

      const info = await this.api.instances.getInstance({
        'instance-id': instance,
      });
      server.ip = info.instance.main_ip;
      await server.save();

      // Write key
      const sshKey = this.provider.metadata.vultrSSHAccessKey;
      writeFileSync(`./vultr-${server.id}.key`, sshKey);

      // Connect via ssh
      const sshconfig = {
        host: server.ip,
        username: 'root',
        identity: `./vultr-${server.id}.key`,
      };
      this.logger.log('Connecting to server via SSH...');
      const ssh = new SSH2Promise(sshconfig);
      await ssh.connect();
      this.logger.log('Sending startup command...');
      await ssh.exec(script);
      await ssh.close();
      this.logger.log('SSH connection closed');

      return server;
    } catch (error) {
      await this.destroyInstance(server);
      this.logger.error(`Failed to create vultr instance`, error);
      throw error;
    }
  }

  async destroyInstance(server: Server): Promise<void> {
    const { instances } = await this.api.instances.listInstances({});

    for (const sid in instances) {
      const item = instances[sid];
      if (item.label === `${label}-${server.id}`) {
        await this.api.instances.deleteInstance({
          'instance-id': item.id,
        });
      }
    }
  }
}
