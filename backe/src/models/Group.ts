import mongoose, { Document, Schema } from 'mongoose';

export type GroupType = 'LOCAL' | 'PUBLIC';

export interface IGroup extends Document {
  groupName: string;
  groupType: GroupType;
  createdBy?: mongoose.Types.ObjectId;
  areaCode?: string;
  pincode?: string;
  distanceRange?: '1KM' | '2KM';
  location?: {
    type: 'Point';
    coordinates: [number, number];
  };
  members: mongoose.Types.ObjectId[];
}

const useInMemory =
  process.env.NODE_ENV === 'test' && process.env.IN_MEMORY_DB?.trim() === 'true';

let GroupModel: any;

if (useInMemory) {
  type GroupRecord = {
    _id: string;
    groupName: string;
    groupType: GroupType;
    createdBy?: string;
    areaCode?: string;
    pincode?: string;
    distanceRange?: '1KM' | '2KM';
    location?: { type: 'Point'; coordinates: [number, number] };
    members: string[];
  };

  const groups = new Map<string, GroupRecord>();

  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

  const matches = (value: any, query: any): boolean => {
    if (!query || Object.keys(query).length === 0) return true;

    for (const [key, expected] of Object.entries(query)) {
      if (key === '$or' && Array.isArray(expected)) {
        if (!(expected as any[]).some((branch) => matches(value, branch))) return false;
        continue;
      }

      const actual = value?.[key];

      if (expected instanceof RegExp) {
        if (!expected.test(String(actual || ''))) return false;
        continue;
      }

      if (Array.isArray(actual) && !Array.isArray(expected)) {
        if (!actual.some((item) => String(item) === String(expected))) return false;
        continue;
      }

      if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
        if (!matches(actual || {}, expected)) return false;
        continue;
      }

      if (String(actual) !== String(expected)) return false;
    }

    return true;
  };

  const makeQuery = <T>(resolver: () => T) => {
    let leanMode = false;
    const query: any = {
      select() {
        return query;
      },
      sort() {
        return query;
      },
      limit() {
        return query;
      },
      lean() {
        leanMode = true;
        return query;
      },
      then(resolve: any, reject: any) {
        const value = resolver();
        const out = leanMode ? clone(value) : value;
        return Promise.resolve(out).then(resolve, reject);
      },
      catch(reject: any) {
        const value = resolver();
        const out = leanMode ? clone(value) : value;
        return Promise.resolve(out).catch(reject);
      },
    };
    return query;
  };

  class InMemoryGroup {
    _id: string;
    groupName: string;
    groupType: GroupType;
    createdBy?: string;
    areaCode?: string;
    pincode?: string;
    distanceRange?: '1KM' | '2KM';
    location?: { type: 'Point'; coordinates: [number, number] };
    members: string[];

    constructor(data: any) {
      this._id = String(data?._id || new mongoose.Types.ObjectId().toHexString());
      this.groupName = String(data?.groupName || '');
      this.groupType = (data?.groupType || 'LOCAL') as GroupType;
      this.createdBy = data?.createdBy ? String(data.createdBy) : undefined;
      this.areaCode = data?.areaCode;
      this.pincode = data?.pincode;
      this.distanceRange = data?.distanceRange;
      this.location = data?.location;
      this.members = (data?.members || []).map((m: any) => String(m));
    }

    async save() {
      groups.set(this._id, clone({
        _id: this._id,
        groupName: this.groupName,
        groupType: this.groupType,
        createdBy: this.createdBy,
        areaCode: this.areaCode,
        pincode: this.pincode,
        distanceRange: this.distanceRange,
        location: this.location,
        members: this.members,
      }));
      return this;
    }

    static __resetForTests() {
      groups.clear();
    }

    static __allForTests() {
      return Array.from(groups.values()).map((g) => clone(g));
    }

    static find(query: any = {}) {
      return makeQuery(() =>
        Array.from(groups.values())
          .filter((group) => matches(group, query))
          .map((group) => new InMemoryGroup(group))
      );
    }

    static findOne(query: any = {}) {
      return makeQuery(() => {
        const found = Array.from(groups.values()).find((group) => matches(group, query));
        return found ? new InMemoryGroup(found) : null;
      });
    }

    static findById(id: any) {
      return makeQuery(() => {
        const found = groups.get(String(id));
        return found ? new InMemoryGroup(found) : null;
      });
    }

    static async findByIdAndUpdate(id: any, update: any) {
      const found = groups.get(String(id));
      if (!found) return null;
      const next = clone(found);

      if (update?.$pull?.members) {
        const removeId = String(update.$pull.members);
        next.members = (next.members || []).filter((member) => String(member) !== removeId);
      }

      if (update?.$addToSet?.members?.$each) {
        const existing = new Set((next.members || []).map((member) => String(member)));
        for (const member of update.$addToSet.members.$each) existing.add(String(member));
        next.members = Array.from(existing);
      }

      groups.set(String(id), next);
      return new InMemoryGroup(next);
    }

    static async findByIdAndDelete(id: any) {
      const found = groups.get(String(id));
      if (!found) return null;
      groups.delete(String(id));
      return new InMemoryGroup(found);
    }
  }

  GroupModel = InMemoryGroup as any;
} else {
  const GroupSchema = new Schema<IGroup>(
    {
      groupName: { type: String, required: true, unique: true, index: true },
      groupType: { type: String, enum: ['LOCAL', 'PUBLIC'], default: 'LOCAL', index: true },
      createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
      areaCode: { type: String, required: function (this: any) { return this.groupType === 'LOCAL'; } },
      pincode: { type: String, required: function (this: any) { return this.groupType === 'LOCAL'; } },
      distanceRange: {
        type: String,
        enum: ['1KM', '2KM'],
        required: function (this: any) { return this.groupType === 'LOCAL'; },
      },
      location: {
        type: {
          type: String,
          enum: ['Point'],
          required: function (this: any) { return this.groupType === 'LOCAL'; },
        },
        coordinates: {
          type: [Number],
          required: function (this: any) { return this.groupType === 'LOCAL'; },
        },
      },
      members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    },
    { timestamps: true }
  );

  GroupSchema.index(
    { location: '2dsphere' },
    { partialFilterExpression: { groupType: 'LOCAL', 'location.coordinates': { $type: 'array' } } }
  );

  GroupModel = mongoose.model<IGroup>('Group', GroupSchema);
}

export default GroupModel;
