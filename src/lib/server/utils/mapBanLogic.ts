/**
 * Pure map ban/pick turn logic.
 * Kept free of Prisma so unit tests and the mapBans service can share it.
 */

/**
 * Determine next action type (ban or pick) based on action count and BO series
 * @param actionCount - Number of actions already taken
 * @param boSeries - Best of series (3, 5, or 7)
 * @returns 'ban', 'pick', or '' if complete
 */
export function determineNextAction(actionCount: number, boSeries: number): 'ban' | 'pick' | '' {
  if (boSeries === 3) {
    // BO3 pattern: Away ban, Home ban, Home pick, Away pick, Away ban, Home pick
    switch (actionCount) {
      case 0:
        return 'ban'; // Away ban
      case 1:
        return 'ban'; // Home ban
      case 2:
        return 'pick'; // Home pick
      case 3:
        return 'pick'; // Away pick
      case 4:
        return 'ban'; // Away ban
      case 5:
        return 'pick'; // Home pick (final)
      default:
        return '';
    }
  } else if (boSeries === 5) {
    // BO5 pattern: Away ban, Home ban, Home pick, Away pick, Away ban, Home pick, Away pick, Home pick
    switch (actionCount) {
      case 0:
        return 'ban'; // Away ban
      case 1:
        return 'ban'; // Home ban
      case 2:
        return 'pick'; // Home pick
      case 3:
        return 'pick'; // Away pick
      case 4:
        return 'ban'; // Away ban
      case 5:
        return 'pick'; // Home pick
      case 6:
        return 'pick'; // Away pick
      case 7:
        return 'pick'; // Home pick (final)
      default:
        return '';
    }
  } else if (boSeries === 7) {
    // BO7 pattern: Away ban, Home ban, Home pick, Away pick, Away ban, Home pick, Away pick, Home pick, Away pick, Home pick
    switch (actionCount) {
      case 0:
        return 'ban'; // Away ban
      case 1:
        return 'ban'; // Home ban
      case 2:
        return 'pick'; // Home pick
      case 3:
        return 'pick'; // Away pick
      case 4:
        return 'ban'; // Away ban
      case 5:
        return 'pick'; // Home pick
      case 6:
        return 'pick'; // Away pick
      case 7:
        return 'pick'; // Home pick
      case 8:
        return 'pick'; // Away pick
      case 9:
        return 'pick'; // Home pick (final)
      default:
        return '';
    }
  }

  return '';
}

/**
 * Determine if turn should switch after an action
 * @param actionCount - Number of actions already taken (before this action)
 * @param boSeries - Best of series (3, 5, or 7)
 * @returns true if turn should switch to other team
 */
export function shouldSwitchTurn(actionCount: number, boSeries: number): boolean {
  if (boSeries === 3) {
    // BO3 pattern: Away→Home→Home→Away→Away→Home
    switch (actionCount) {
      case 0:
        return true; // After Away ban, switch to Home
      case 1:
        return false; // After Home ban, stay on Home for pick
      case 2:
        return true; // After Home pick, switch to Away
      case 3:
        return false; // After Away pick, stay on Away for ban
      case 4:
        return true; // After Away ban, switch to Home for final pick
      default:
        return false;
    }
  } else if (boSeries === 5) {
    // BO5 pattern: Away→Home→Home→Away→Away→Home→Away→Home
    switch (actionCount) {
      case 0:
        return true; // After Away ban, switch to Home
      case 1:
        return false; // After Home ban, stay on Home for pick
      case 2:
        return true; // After Home pick, switch to Away
      case 3:
        return false; // After Away pick, stay on Away for ban
      case 4:
        return true; // After Away ban, switch to Home for pick
      case 5:
        return true; // After Home pick, switch to Away for pick
      case 6:
        return true; // After Away pick, switch to Home for final pick
      default:
        return false;
    }
  } else if (boSeries === 7) {
    // BO7 pattern: Away→Home→Home→Away→Away→Home→Away→Home→Away→Home
    switch (actionCount) {
      case 0:
        return true; // After Away ban, switch to Home
      case 1:
        return false; // After Home ban, stay on Home for pick
      case 2:
        return true; // After Home pick, switch to Away
      case 3:
        return false; // After Away pick, stay on Away for ban
      case 4:
        return true; // After Away ban, switch to Home for pick
      case 5:
        return true; // After Home pick, switch to Away for pick
      case 6:
        return true; // After Away pick, switch to Home for pick
      case 7:
        return true; // After Home pick, switch to Away for pick
      case 8:
        return true; // After Away pick, switch to Home for final pick
      default:
        return false;
    }
  }

  return false;
}
