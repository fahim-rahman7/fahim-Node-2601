import SSLCommerzPayment from 'sslcommerz-lts';
import { Group } from '../models/group.model.js';
import { GroupMessage } from '../models/groupMessage.model.js';
import { User } from '../models/user.model.js';
import { redisClient } from '../config/redis.js';
import { AppError } from '../utils/appError.js';
import crypto from 'crypto';

const store_id = process.env.STORE_ID;
const store_passwd = process.env.STORE_PASSWORD;
const is_live = process.env.IS_LIVE === 'true'; // Sandbox er jonno false thakbe

// Helper URLs for Local & Production (Render + Vercel)
const getBackendUrl = (req) => process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
const getFrontendUrl = () => process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173';


export const initGroupPayment = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const { groupName, members } = req.body || {}; // members = [friendId1, friendId2, ...]

    if (!groupName || typeof groupName !== 'string' || !groupName.trim()) {
      throw new AppError('Group name is required!', 400);
    }

    if (!members || !Array.isArray(members) || members.length === 0) {
      throw new AppError('Group members are required!', 400);
    }

    // Validate that admin exists
    const adminUser = await User.findById(userId);
    if (!adminUser) {
      throw new AppError('Admin user no longer exists!', 404);
    }

    // Validate that all members are actually friends of the admin
    const allAreFriends = members.every((memberId) =>
      adminUser.friends?.some((friendId) => friendId.toString() === memberId.toString())
    );

    if (!allAreFriends) {
      throw new AppError('All members must be in your friend list!', 400);
    }

    const tran_id = 'GRP_' + crypto.randomBytes(12).toString('hex');
    const amount = 100;

    // Store pending group data in Redis for 30 minutes
    const groupData = {
      admin: userId.toString(),
      groupName: groupName.trim(),
      members: [...members, userId.toString()], // Admino member hisebe thakbe
    };
    await redisClient.set(`pending_group:${tran_id}`, JSON.stringify(groupData), 'EX', 1800);

    const BACKEND_URL = getBackendUrl(req);

    const data = {
      total_amount: amount,
      currency: 'BDT',
      tran_id: tran_id,
      success_url: `${BACKEND_URL}/api/v1/groups/payment/success/${tran_id}`,
      fail_url: `${BACKEND_URL}/api/v1/groups/payment/fail/${tran_id}`,
      cancel_url: `${BACKEND_URL}/api/v1/groups/payment/cancel`,
      ipn_url: `${BACKEND_URL}/api/v1/groups/payment/ipn`,
      shipping_method: 'N/A',
      product_name: 'Group Chat Creation',
      product_category: 'Service',
      product_profile: 'general',
      cus_name: adminUser.name,
      cus_email: adminUser.email,
      cus_add1: adminUser.address || 'Dhaka',
      cus_city: 'Dhaka',
      cus_postcode: '1212',
      cus_country: 'Bangladesh',
      cus_phone: adminUser.phone || '01700000000',
      ship_name: 'N/A',
      ship_add1: 'N/A',
      ship_city: 'N/A',
      ship_postcode: 'N/A',
      ship_country: 'N/A',
    };

    const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
    const apiResponse = await sslcz.init(data);

    let GatewayPageURL = apiResponse?.GatewayPageURL;
    if (GatewayPageURL) {
      return res.status(200).json({ success: true, gatewayUrl: GatewayPageURL });
    } else {
      throw new AppError('SSLCommerz initialization failed', 400);
    }
  } catch (error) {
    next(error);
  }
};

export const paymentSuccess = async (req, res, next) => {
  const FRONTEND_URL = getFrontendUrl();
  try {
    const { tran_id } = req.params;

    if (!tran_id) {
      return res.redirect(`${FRONTEND_URL}/chat?payment=error`);
    }

    const cachedData = await redisClient.get(`pending_group:${tran_id}`);
    if (!cachedData) {
      return res.redirect(`${FRONTEND_URL}/chat?payment=expired`);
    }

    const { admin, groupName, members } = JSON.parse(cachedData);

    // Create Group in MongoDB
    await Group.create({
      name: groupName,
      admin,
      members,
    });

    // Clear redis cache
    await redisClient.del(`pending_group:${tran_id}`);

    // Frontend-এ success কুয়েরি দিয়ে রিডাইরেক্ট করা
    return res.redirect(`${FRONTEND_URL}/chat?payment=success`);
  } catch (error) {
    console.error('Payment Success Error:', error.message);
    return res.redirect(`${FRONTEND_URL}/chat?payment=error`);
  }
};

export const paymentFail = async (req, res, next) => {
  const FRONTEND_URL = getFrontendUrl();
  try {
    const { tran_id } = req.params;
    if (tran_id) {
      await redisClient.del(`pending_group:${tran_id}`);
    }
    return res.redirect(`${FRONTEND_URL}/chat?payment=failed`);
  } catch (error) {
    return res.redirect(`${FRONTEND_URL}/chat?payment=error`);
  }
};

export const paymentCancel = async (req, res, next) => {
  const FRONTEND_URL = getFrontendUrl();
  try {
    return res.redirect(`${FRONTEND_URL}/chat?payment=cancelled`);
  } catch (error) {
    return res.redirect(`${FRONTEND_URL}/chat?payment=error`);
  }
};

export const getUserGroups = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const groups = await Group.find({ members: userId }).populate(
      'members',
      'name profilePicture email'
    );

    return res.status(200).json({ success: true, data: groups });
  } catch (error) {
    next(error);
  }
};

export const getGroupMessages = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const { groupId } = req.params;

    if (!groupId) {
      throw new AppError('Group ID is required!', 400);
    }

    const group = await Group.findById(groupId);
    if (!group) {
      throw new AppError('Group not found!', 404);
    }

    if (!group.members.some((memberId) => memberId.toString() === userId.toString())) {
      throw new AppError('Access denied! You are not a member of this group.', 403);
    }

    const messages = await GroupMessage.find({ group: groupId })
      .sort({ createdAt: 1 })
      .populate('sender', 'name profilePicture');

    return res.status(200).json({ success: true, data: messages });
  } catch (error) {
    next(error);
  }
};

export const addMemberToGroup = async (req, res, next) => {
  try {
    const currentUserId = req.user?._id;
    const { groupId } = req.params;
    const { members } = req.body || {}; // Array of friend IDs: ["id1", "id2", ...]

    if (!groupId) {
      throw new AppError('Group ID is required!', 400);
    }

    if (!members || !Array.isArray(members) || members.length === 0) {
      throw new AppError('Please provide an array of member IDs to add!', 400);
    }

    const group = await Group.findById(groupId);
    if (!group) {
      throw new AppError('Group not found!', 404);
    }

    // 1. Check if requester is Admin
    if (group.admin.toString() !== currentUserId.toString()) {
      throw new AppError('Only the group admin can add new members!', 403);
    }

    // 2. Ensure all member IDs belong to the admin's friend list
    const adminUser = await User.findById(currentUserId);
    if (!adminUser) {
      throw new AppError('Admin user no longer exists!', 404);
    }

    const nonFriends = members.filter(
      (mId) => !adminUser.friends?.some((fId) => fId.toString() === mId.toString())
    );

    if (nonFriends.length > 0) {
      throw new AppError('You can only add users who are in your friend list!', 400);
    }

    // 3. Filter out users who are already group members
    const newMembers = members.filter(
      (mId) => !group.members.some((existingId) => existingId.toString() === mId.toString())
    );

    if (newMembers.length === 0) {
      throw new AppError('All selected users are already members of this group!', 400);
    }

    // 4. Add new unique members to the group ($addToSet prevents duplicates)
    await Group.findByIdAndUpdate(groupId, {
      $addToSet: { members: { $each: newMembers } },
    });

    const updatedGroup = await Group.findById(groupId).populate(
      'members',
      'name email profilePicture'
    );

    return res.status(200).json({
      success: true,
      message: `${newMembers.length} member(s) added to group successfully!`,
      data: updatedGroup,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteGroup = async (req, res, next) => {
  try {
    const currentUserId = req.user?._id;
    const { groupId } = req.params;

    if (!groupId) {
      throw new AppError('Group ID is required!', 400);
    }

    const group = await Group.findById(groupId);
    if (!group) {
      throw new AppError('Group not found!', 404);
    }

    // Check if requester is Admin
    if (group.admin.toString() !== currentUserId.toString()) {
      throw new AppError('Only the group admin can delete this group!', 403);
    }

    // Delete all messages belonging to this group
    await GroupMessage.deleteMany({ group: groupId });

    // Delete the group itself
    await Group.findByIdAndDelete(groupId);

    return res.status(200).json({ success: true, message: 'Group deleted successfully!' });
  } catch (error) {
    next(error);
  }
};