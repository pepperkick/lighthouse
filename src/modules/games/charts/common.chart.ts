import { GameArgsOptions as Tf2Args } from './tf2.chart';
import { GameArgsOptions as ValheimArgs } from './valheim.chart';

export interface GameArgsOptions extends Tf2Args, ValheimArgs {

}

export interface BookingOptions extends GameArgsOptions {
  /**
   * Deployment ID
   */
  id: string

  /**
   * Image name to use
   */
  image: string

  /**
   * Node hostname to use
   */
  hostname: string
}